import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isinCheckDigit, signPush } from '@stockpanic/core';
import type { SummarySentence } from '@stockpanic/core';
import { listEnabledSources, migrate } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { receivePush } from '../../../web/src/ingest.ts';
import { drainAi } from '../ai/runner.ts';
import type { AiClient, AiOutcome } from '../ai/client.ts';
import { tinyPdf } from '../ai/documents.test.ts';
import { HttpDocumentFetcher } from '../ai/documents.ts';
import { buildPipelineContext, drainPipeline } from '../pipeline/runner.ts';
import { drainInbox, fetchFilingsOnce, reconcileFilings } from './filings.ts';
import type { FetchLike } from './http.ts';

// All companies, filings and URLs are fictional. No network: the vendor and the model are fakes.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');
const SECRET = 'vendor-push-secret-that-is-at-least-32-characters';

const env = (id: string, over: Record<string, unknown> = {}) => ({
  exchange: 'BSE',
  announcement_id: id,
  scrip_code: '500101',
  subject: `Outcome of Board Meeting ${id}`,
  category: 'Board Meeting',
  published_at: new Date(Date.now() - 60_000).toISOString(),
  url: `https://exchange.example.in/ann/${id}`,
  attachment_url: null,
  ...over,
});

describe.skipIf(!adminUrl)('filings adapter (PostgreSQL, fake vendor)', () => {
  const dbName = `sp_fil_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const pages = new Map<string, unknown>(); // cursor -> response body
  const requests: string[] = [];
  const vendor: FetchLike = async (url, init) => {
    requests.push(url);
    const auth = new Headers(init?.headers).get('authorization');
    if (auth !== 'Bearer vendor-token') return new Response('unauthorised', { status: 401 });
    const u = new URL(url);
    const key = u.pathname.endsWith('/reconcile') ? `date:${u.searchParams.get('date')}` : (u.searchParams.get('cursor') ?? '');
    const body = pages.get(key);
    return body ? new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
  };
  const deps = { fetchImpl: vendor, env: { VENDOR_TOKEN: 'vendor-token' }, jitter: () => 1 };
  const source = async (id: string) => (await listEnabledSources(db)).find((s) => s.sourceId === id)!;
  const pipeline = async () => drainPipeline(db, await buildPipelineContext(db, new Date()), { workerId: 'test' });
  const itemByAnn = async (id: string) =>
    (await db.query(`SELECT i.id, i.headline, i.status, i.first_seen_at, si.story_id FROM filing_detail f JOIN item i ON i.id = f.item_id LEFT JOIN story_item si ON si.item_id = i.id WHERE f.announcement_id = $1`, [id])).rows[0];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [A]);
    await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', 'Asterion Industries Limited', '[2020-01-01,)')`, [A]);
    await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'BSE', '500101', '[2020-01-01,)')`, [A]);
    const cadence = JSON.stringify(Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map((s) => [s, { poll_s: 5, expect: true }])));
    await db.query(
      `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter) VALUES
         ('src_vendor_poll', 'Vendor (poll)', 'filing', 1, 'test', current_date, true, $1, $2),
         ('src_vendor_push', 'Vendor (push)', 'filing', 1, 'test', current_date, true, $1, $3)`,
      [
        cadence,
        { type: 'filings_poll', url: 'https://vendor.example/announcements', reconcile_url: 'https://vendor.example/reconcile', token_env: 'VENDOR_TOKEN' },
        { type: 'filings_push', secret_env: 'VENDOR_PUSH_SECRET' },
      ],
    );
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('poll: follows cursors, stores filings verbatim, tags by scrip code, remembers the cursor', async () => {
    pages.set('', { announcements: [env('P-1'), env('P-2')], next_cursor: 'c1' });
    pages.set('c1', { announcements: [env('P-3'), { exchange: 'BSE' }], next_cursor: 'c2' });
    pages.set('c2', { announcements: [], next_cursor: 'c2' });
    const r = await fetchFilingsOnce(db, await source('src_vendor_poll'), 'open', new Date(), deps);
    expect(r).toMatchObject({ outcome: 'error', inserted: 3, discardedInvalid: 1 });
    expect(r.error).toContain('cursor not advanced');
    expect((await db.query(`SELECT cursor FROM source_fetch_state WHERE source_id = 'src_vendor_poll'`)).rows[0].cursor).toBe('c1');
    // The corrected page is replayed; already stored rows remain idempotent.
    pages.set('c1',{announcements:[env('P-3')],next_cursor:'c2'});
    await fetchFilingsOnce(db,await source('src_vendor_poll'),'open',new Date(),deps);
    expect((await db.query(`SELECT cursor FROM source_fetch_state WHERE source_id = 'src_vendor_poll'`)).rows[0].cursor).toBe('c2');

    await pipeline();
    const it1 = await itemByAnn('P-1');
    expect(it1.headline).toBe('Outcome of Board Meeting P-1');
    expect((await db.query('SELECT isin, method FROM story_tag WHERE story_id = $1', [it1.story_id])).rows).toEqual([{ isin: A, method: 'exchange_code' }]);

    const again = await fetchFilingsOnce(db, await source('src_vendor_poll'), 'open', new Date(), deps);
    expect(again).toMatchObject({ outcome: 'no_new_items', inserted: 0 });
  });

  it('poll: vendor errors count against source health', async () => {
    const r = await fetchFilingsOnce(db, await source('src_vendor_poll'), 'open', new Date(), { ...deps, env: {} });
    expect(r).toMatchObject({ outcome: 'error', error: 'missing provider credential environment variable: VENDOR_TOKEN' });
    expect((await db.query(`SELECT consecutive_failures FROM source_health WHERE source_id = 'src_vendor_poll'`)).rows[0].consecutive_failures).toBe(1);
  });

  it('revision keeps the item and story, records the previous version; withdrawal is a status, never a delete', async () => {
    const before = await itemByAnn('P-2');
    pages.set('c2', { announcements: [env('P-2', { subject: 'Outcome of Board Meeting P-2 (revised)' }), env('P-3', { status: 'withdrawn' })], next_cursor: 'c3' });
    pages.set('c3', { announcements: [], next_cursor: null });
    const r = await fetchFilingsOnce(db, await source('src_vendor_poll'), 'open', new Date(), deps);
    expect(r).toMatchObject({ inserted: 0, duplicates: 2 });
    await pipeline();
    const after = await itemByAnn('P-2');
    expect(after).toMatchObject({ id: before.id, story_id: before.story_id, headline: 'Outcome of Board Meeting P-2 (revised)' });
    expect((await db.query('SELECT previous->>$2 AS h FROM item_revision WHERE item_id = $1', [after.id, 'headline'])).rows).toEqual([{ h: 'Outcome of Board Meeting P-2' }]);
    expect((await itemByAnn('P-3')).status).toBe('withdrawn_by_exchange');
    expect((await db.query(`SELECT count(*)::int AS n FROM live_event WHERE type = 'story.updated' AND payload->>'story_id' = (SELECT public_id FROM story WHERE id = $1)`, [after.story_id])).rows[0].n).toBe(1);
    // Withdrawn stays withdrawn even if a later delivery omits the status.
    pages.set('c3', { announcements: [env('P-3')], next_cursor: null });
    await fetchFilingsOnce(db, await source('src_vendor_poll'), 'open', new Date(), deps);
    expect((await itemByAnn('P-3')).status).toBe('withdrawn_by_exchange');
  });

  it('push: signed deliveries land in the inbox; bad signatures and unknown sources are refused', async () => {
    const pushEnv = { VENDOR_PUSH_SECRET: SECRET };
    const body = JSON.stringify({ announcements: [env('H-1', { exchange: 'NSE', scrip_code: 'ASTERION' })] });
    const now = new Date();
    expect(await receivePush(db, 'src_vendor_push', body, signPush('wrong-secret-wrong-secret-wrong-secret', body, now), pushEnv, now)).toMatchObject({ status: 401 });
    expect(await receivePush(db, 'src_vendor_poll', body, signPush(SECRET, body, now), pushEnv, now)).toMatchObject({ status: 401 });
    expect(await receivePush(db, 'src_vendor_push', body, signPush(SECRET, body, now), {}, now)).toMatchObject({ status: 401 });
    expect(await receivePush(db, 'src_vendor_push', body, signPush(SECRET, body, now), pushEnv, now)).toMatchObject({ status: 202 });
    expect(await receivePush(db, 'src_vendor_push', body, signPush(SECRET, body, now), pushEnv, now)).toMatchObject({ status: 202 }); // vendor retry
    const r = await drainInbox(db, new Date());
    expect(r).toMatchObject({ payloads: 2, inserted: 1, duplicates: 1 });
    expect(await itemByAnn('H-1')).toBeTruthy();
    expect((await db.query(`SELECT count(*)::int AS n FROM raw_inbox WHERE processed_at IS NULL`)).rows[0].n).toBe(0);
  });

  it('reconciliation backfills gaps at their original time and records coverage', async () => {
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const early = new Date(Date.now() - 6 * 3600_000).toISOString();
    pages.set(`date:${today}`, { announcements: [env('P-1'), env('P-2'), env('P-3'), env('R-9', { published_at: early })] });
    const r = await reconcileFilings(db, await source('src_vendor_poll'), today, new Date(), deps);
    expect(r.error).toBeNull();
    expect(r.byExchange).toEqual([{ exchange: 'BSE', expected: 4, ingested: 3, backfilled: 1, coverage: 0.75, alert: true }]);
    await pipeline();
    const story = (await db.query(`SELECT s.first_seen_at FROM story s JOIN story_item si ON si.story_id = s.id JOIN filing_detail f ON f.item_id = si.item_id WHERE f.announcement_id = 'R-9'`)).rows[0];
    expect(new Date(story.first_seen_at).toISOString()).toBe(new Date(early).toISOString());
    expect(r.latency.length).toBeGreaterThan(0);
    expect(r.latency.reduce((n, l) => n + l.filings, 0)).toBe(4); // P-1..P-3 and H-1 (NSE); R-9 excluded as backfilled
  });

  it('summaries fetch the attachment, keep its extracted text, and regenerate after a revision', async () => {
    await db.query(`UPDATE setting SET value = 'true' WHERE key = 'ai_enabled'`);
    pages.set('c3', { announcements: [env('S-1', { subject: 'Financial Results for the quarter ended September 30, 2026', category: 'Result', attachment_url: 'https://exchange.example.in/att/S-1.pdf' })], next_cursor: null });
    await fetchFilingsOnce(db, await source('src_vendor_poll'), 'open', new Date(), deps);
    await pipeline();
    const text = ['Asterion Industries Limited informed the exchange that its board approved audited results for the quarter ended September 30, 2026.', 'Revenue from operations was Rs 1,250.50 crore against Rs 1,100 crore a year earlier.', 'The board recommended a dividend of Rs 4 per share.'];
    const attachments: FetchLike = async () => new Response(Buffer.from(tinyPdf(text)), { headers: { 'content-type': 'application/pdf' } });
    const summary: SummarySentence[] = [{ text: 'The board recommended a dividend of Rs 4 per share.', citedText: ['The board recommended a dividend of Rs 4 per share.'] }];
    const fake: AiClient = {
      classify: async () => { throw new Error('unexpected'); },
      summarise: async (): Promise<AiOutcome<SummarySentence[]>> => ({ kind: 'ok', value: summary, usage: { inputTokens: 500, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 }, modelId: 'claude-haiku-4-5', latencyMs: 10 }),
    };
    const aiDeps = { client: fake, documents: new HttpDocumentFetcher(attachments, ['exchange.example.in']), mailer: new MemoryMailer(), opsEmail: null, log: () => undefined };
    expect((await drainAi(db, aiDeps, { workerId: 'test' })).counts).toEqual({ accepted: 1 });
    const s1 = await itemByAnn('S-1');
    expect((await db.query('SELECT extracted_text FROM filing_detail WHERE item_id = $1', [s1.id])).rows[0].extracted_text).toContain('Rs 1,250.50 crore');
    expect((await db.query('SELECT count(*)::int AS n FROM story_summary WHERE story_id = $1', [s1.story_id])).rows[0].n).toBe(1);

    // The exchange replaces the attachment: old text and summary go; the job regenerates both.
    pages.set('c3', { announcements: [env('S-1', { subject: 'Financial Results for the quarter ended September 30, 2026', category: 'Result', attachment_url: 'https://exchange.example.in/att/S-1-v2.pdf' })], next_cursor: null });
    await fetchFilingsOnce(db, await source('src_vendor_poll'), 'open', new Date(), deps);
    expect((await db.query('SELECT count(*)::int AS n FROM story_summary WHERE story_id = $1', [s1.story_id])).rows[0].n).toBe(0);
    await pipeline();
    expect((await drainAi(db, aiDeps, { workerId: 'test' })).counts).toEqual({ accepted: 1 });
    expect((await db.query('SELECT count(*)::int AS n FROM story_summary WHERE story_id = $1', [s1.story_id])).rows[0].n).toBe(1);
  });

  it('maps a licensed vendor JSON shape and an explicit IST timestamp end to end',async()=>{
    const original=(await source('src_vendor_poll')).adapter;
    const adapter={...original,mapping:{announcements_path:'data.records',cursor_path:'pagination.next',exchange:'BSE',timezone:'Asia/Kolkata',fields:{announcement_id:'id',scrip_code:'code',subject:'title',published_at:'date',url:'link',status:'state'},status_values:{active:'live',removed:'withdrawn'}}};
    await db.query(`UPDATE source SET adapter=$1 WHERE source_id='src_vendor_poll'`,[adapter]);
    try {
      const response={data:{records:[{id:'MAP-1',code:500101,title:'Board approves expansion',date:'2026-10-09 10:00:00',link:'https://exchange.example.in/mapped',state:'active'}]},pagination:{next:null}};
      const fetchImpl:FetchLike=async()=>new Response(JSON.stringify(response),{status:200});
      expect(await fetchFilingsOnce(db,await source('src_vendor_poll'),'open',new Date(),{...deps,fetchImpl})).toMatchObject({inserted:1,error:null});
      const row=(await db.query(`SELECT published_at FROM item WHERE dedup_key='BSE:MAP-1'`)).rows[0];
      expect(row.published_at.toISOString()).toBe('2026-10-09T04:30:00.000Z');
      await pipeline();
      const mapped=await itemByAnn('MAP-1');
      expect((await db.query('SELECT isin,method FROM story_tag WHERE story_id=$1',[mapped.story_id])).rows).toEqual([{isin:A,method:'exchange_code'}]);
    } finally {await db.query(`UPDATE source SET adapter=$1 WHERE source_id='src_vendor_poll'`,[original]);}
  });

  it('counts backfills per exchange when a combined feed reuses an announcement ID', async () => {
    const date = '2026-10-09';
    const announcements = ['BSE', 'NSE'].map(exchange => env('SHARED-ID', { exchange, published_at: '2026-10-09T10:00:00+05:30' }));
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify({ announcements }));
    const first = await reconcileFilings(db, await source('src_vendor_poll'), date, new Date(), { ...deps, fetchImpl });
    expect(first.error).toBeNull();
    expect(first.byExchange).toEqual([
      expect.objectContaining({ exchange: 'BSE', expected: 1, ingested: 0, backfilled: 1 }),
      expect.objectContaining({ exchange: 'NSE', expected: 1, ingested: 0, backfilled: 1 }),
    ]);
    const replay = await reconcileFilings(db, await source('src_vendor_poll'), date, new Date(), { ...deps, fetchImpl });
    expect(replay.error).toBeNull();
    expect(replay.byExchange).toEqual([
      expect.objectContaining({ exchange: 'BSE', expected: 1, ingested: 1, backfilled: 0 }),
      expect.objectContaining({ exchange: 'NSE', expected: 1, ingested: 1, backfilled: 0 }),
    ]);
  });

  it('rejects invalid or paginated reconciliation without recording optimistic coverage',async()=>{
    const date='2026-10-09';
    const count=async()=>(await db.query('SELECT count(*)::int n FROM reconciliation_run')).rows[0].n;
    const before=await count();
    for(const body of [{announcements:[{exchange:'BSE'}]}, {announcements:[env('BAD-RECON')],next_cursor:'next-page'}]) {
      const r=await reconcileFilings(db,await source('src_vendor_poll'),date,new Date(),{...deps,fetchImpl:async()=>new Response(JSON.stringify(body))});
      expect(r.error).not.toBeNull();expect(r.byExchange).toEqual([]);
    }
    expect(await count()).toBe(before);
  });
});
