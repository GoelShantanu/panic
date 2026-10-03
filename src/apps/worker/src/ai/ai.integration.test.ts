import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isinCheckDigit, newPublicId } from '@stockpanic/core';
import type { SummarySentence, Usage } from '@stockpanic/core';
import { AI_QUEUE, migrate, storeCandidates } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { buildPipelineContext, drainPipeline } from '../pipeline/runner.ts';
import type { AiClient, AiOutcome, ClassifyRequest } from './client.ts';
import { drainAi } from './runner.ts';

// All companies, filings and figures are fictional. No network: the model is a fake.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');
const H1 = isin('E00HAL101');
const H2 = isin('E00HAL201');
const usage: Usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 };

class FakeAi implements AiClient {
  classifyReplies: (AiOutcome<unknown> | Error)[] = [];
  summaryReplies: AiOutcome<SummarySentence[]>[] = [];
  seen: ClassifyRequest[] = [];
  async classify(req: ClassifyRequest): Promise<AiOutcome<unknown>> {
    this.seen.push(req);
    const r = this.classifyReplies.shift();
    if (!r) throw new Error('no fake reply');
    if (r instanceof Error) throw r;
    return r;
  }
  async summarise(): Promise<AiOutcome<SummarySentence[]>> {
    const r = this.summaryReplies.shift();
    if (!r) throw new Error('no fake reply');
    return r;
  }
}
const ok = <T>(value: T): AiOutcome<T> => ({ kind: 'ok', value, usage, modelId: 'claude-haiku-4-5', latencyMs: 120 });

const FILING_TEXT =
  'Asterion Industries Limited informed the exchange that its board approved audited results for the quarter ended September 30, 2026. ' +
  'Revenue from operations was ₹1,250.50 crore against ₹1,100 crore a year earlier. The board recommended a dividend of ₹4 per share. ' +
  'The record date is 14 November 2026.';
const GOOD_SUMMARY: SummarySentence[] = [
  { text: 'Asterion Industries reported revenue from operations of ₹1,250.50 crore for the quarter ended September 30, 2026.', citedText: ['Revenue from operations was ₹1,250.50 crore against ₹1,100 crore a year earlier.', 'audited results for the quarter ended September 30, 2026'] },
  { text: 'The board recommended a dividend of ₹4 per share.', citedText: ['The board recommended a dividend of ₹4 per share.'] },
];

describe.skipIf(!adminUrl)('AI layer jobs (PostgreSQL, fake model)', () => {
  const dbName = `sp_ai_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let fake: FakeAi;
  let mailer: MemoryMailer;
  const log: string[] = [];
  const deps = () => ({ client: fake, mailer, opsEmail: 'ops@example.invalid', log: (l: string) => log.push(l) });
  const drain = () => drainAi(db, deps(), { workerId: 'test' });
  const pipeline = async () => drainPipeline(db, await buildPipelineContext(db, new Date()), { workerId: 'test' });

  const article = async (key: string, headline: string) => {
    await storeCandidates(db, { sourceId: 'src_desk', kind: 'article', excerptAllowed: false }, [
      { kind: 'article', dedupKey: key, headline, url: `https://news.example.in/${key}`, publishedAt: new Date(), excerpt: null },
    ]);
    await pipeline();
    return (await db.query('SELECT i.id AS item_id, si.story_id FROM item i JOIN story_item si ON si.item_id = i.id WHERE i.dedup_key = $1', [key])).rows[0];
  };
  const filing = async (id: string, subject: string, text: string | null) => {
    await db.query('BEGIN');
    const { rows } = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at) VALUES ($1, 'filing', 'src_bse_ann', $2, $3, $4, now()) RETURNING id`,
      [newPublicId('it'), `BSE:${id}`, subject, `https://exchange.example.in/BSE/${id}`],
    );
    await db.query(`INSERT INTO filing_detail (item_id, exchange, announcement_id, scrip_code, category, extracted_text) VALUES ($1, 'BSE', $2, '500101', 'Result', $3)`, [rows[0].id, id, text]);
    await db.query(`INSERT INTO job (queue, priority, payload) VALUES ('pipeline', 10, $1)`, [{ item_id: rows[0].id }]);
    await db.query('COMMIT');
    await pipeline();
    return (await db.query('SELECT story_id FROM story_item WHERE item_id = $1', [rows[0].id])).rows[0].story_id as string;
  };
  const aiJobs = async () => (await db.query(`SELECT payload->>'kind' AS kind FROM job WHERE queue = $1 AND completed_at IS NULL AND failed_at IS NULL ORDER BY id`, [AI_QUEUE])).rows.map((r) => r.kind);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    for (const [i, name, code] of [[A, 'Asterion Industries Limited', '500101'], [H1, 'Halcyon Motors Limited', '500201'], [H2, 'Halcyon Textiles Limited', '500202']] as const) {
      await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [i]);
      await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', $2, '[2020-01-01,)')`, [i, name]);
      await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'BSE', $2, '[2020-01-01,)')`, [i, code]);
    }
    for (const i of [H1, H2]) {
      await db.query(`INSERT INTO instrument_alias (isin, alias, alias_norm, kind, common_word, valid) VALUES ($1, 'Halcyon', 'halcyon', 'curated', false, '[2020-01-01,)')`, [i]);
    }
    const cadence = JSON.stringify(Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map((s) => [s, { poll_s: 60, expect: true }])));
    for (const [id, kind, tier] of [['src_desk', 'article', 3], ['src_bse_ann', 'filing', 1]] as const) {
      await db.query(
        `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter)
         VALUES ($1, $1, $2, $3, 'test', current_date, true, $4, '{"type":"rss","url":"https://example.invalid"}')`,
        [id, kind, tier, cadence],
      );
    }
  });

  beforeEach(() => {
    fake = new FakeAi();
    mailer = new MemoryMailer();
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('with AI off, the pipeline queues nothing', async () => {
    await article('off-1', 'Halcyon wins order from state transport undertaking');
    expect(await aiJobs()).toEqual([]);
    await db.query(`UPDATE setting SET value = 'true' WHERE key = 'ai_enabled'`);
  });

  it('classify: refines event types after publication; candidates only from the registry; no model tag before calibration', async () => {
    const { item_id, story_id } = await article('cls-1', 'Halcyon wins ₹500 crore order from Indian Railways');
    expect(await aiJobs()).toEqual(['classify']);
    expect((await db.query('SELECT array_agg(code) AS t FROM story_event_type WHERE story_id = $1', [story_id])).rows[0].t).toEqual(['order_contract']);

    fake.classifyReplies.push(ok({ event_types: ['order_contract', 'regulatory'], instruments: [{ isin: H1, confidence: 0.99 }, { isin: H2, confidence: 0.1 }] }));
    const r = await drain();
    expect(r.counts).toEqual({ accepted: 1 });
    expect(fake.seen[0]!.candidates.map((c) => c.isin).sort()).toEqual([H1, H2].sort());

    const a = (await db.query('SELECT classifier, event_types, model_scores FROM item_analysis WHERE item_id = $1', [item_id])).rows[0];
    expect(a).toMatchObject({ classifier: 'model', event_types: ['order_contract', 'regulatory'] });
    expect(a.model_scores[0]).toEqual({ isin: H1, confidence: 0.99 });
    expect((await db.query('SELECT array_agg(code ORDER BY code) AS t FROM story_event_type WHERE story_id = $1', [story_id])).rows[0].t).toEqual(['order_contract', 'regulatory']);
    expect((await db.query('SELECT count(*)::int AS n FROM story_tag WHERE story_id = $1', [story_id])).rows[0].n).toBe(0); // stays unresolved (entity-resolution.md §5)
    expect((await db.query(`SELECT count(*)::int AS n FROM live_event WHERE type = 'story.updated'`)).rows[0].n).toBe(1);
    expect((await db.query(`SELECT count(*)::int AS n FROM job WHERE queue = 'alerts' AND payload->>'story_id' = $1`, [String(story_id)])).rows[0].n).toBe(2);
    const call = (await db.query(`SELECT outcome, prompt_version, model_id, cost_inr::float8 AS cost, input_hash FROM ai_call WHERE item_id = $1`, [item_id])).rows[0];
    expect(call).toMatchObject({ outcome: 'accepted', prompt_version: 'classify-v1', model_id: 'claude-haiku-4-5', cost: 0.1448 }); // 1,000 in + 100 out tokens at Haiku prices, ₹96.5 per USD
    expect(call.input_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('classify: invalid output and refusals are discarded; the rules stand', async () => {
    const one = await article('cls-2', 'Halcyon receives contract from metro authority');
    const two = await article('cls-3', 'Halcyon bags export order');
    fake.classifyReplies.push(ok({ event_types: ['order_contract'], instruments: [{ isin: A, confidence: 0.99 }] })); // A was not a candidate
    fake.classifyReplies.push({ kind: 'refused', usage, modelId: 'claude-haiku-4-5', latencyMs: 50 });
    expect((await drain()).counts).toEqual({ invalid: 1, refused: 1 });
    for (const x of [one, two]) {
      expect((await db.query('SELECT classifier FROM item_analysis WHERE item_id = $1', [x.item_id])).rows[0].classifier).toBe('rules');
    }
    expect((await db.query(`SELECT array_agg(outcome ORDER BY id) AS o FROM ai_call WHERE item_id = ANY($1::bigint[])`, [[one.item_id, two.item_id]])).rows[0].o).toEqual(['invalid', 'refused']);
  });

  it('classify: an API error goes back to the queue', async () => {
    await article('cls-4', 'Halcyon wins defence order');
    fake.classifyReplies.push(new Error('overloaded'));
    expect((await drain()).counts).toEqual({ retried: 1 });
    expect((await db.query(`SELECT outcome FROM ai_call ORDER BY id DESC LIMIT 1`)).rows[0].outcome).toBe('error');
    await db.query(`UPDATE job SET completed_at = now() WHERE queue = $1 AND completed_at IS NULL`, [AI_QUEUE]);
  });

  it('summarise: a grounded summary is stored with citations and checks; rule-classified filings skip classify', async () => {
    const story = await filing('7001', 'Financial Results for the quarter ended September 30, 2026', FILING_TEXT);
    expect(await aiJobs()).toEqual(['summarise']);
    fake.summaryReplies.push(ok(GOOD_SUMMARY));
    expect((await drain()).counts).toEqual({ accepted: 1 });
    const s = (await db.query('SELECT body, word_count, citations, checks, prompt_version FROM story_summary WHERE story_id = $1', [story])).rows[0];
    expect(s.body).toBe(GOOD_SUMMARY.map((x) => x.text).join(' '));
    expect(s.word_count).toBeLessThanOrEqual(100);
    expect(s.checks).toMatchObject({ passed: true });
    expect(s.citations[1]).toEqual(['The board recommended a dividend of ₹4 per share.']);
  });

  it('summarise: a summary failing a safeguard is withheld; no text means no call', async () => {
    const story = await filing('7002', 'Financial Results for the quarter ended September 30, 2026', FILING_TEXT);
    fake.summaryReplies.push(ok([{ text: 'Revenue from operations surged to ₹1,250.50 crore.', citedText: ['Revenue from operations was ₹1,250.50 crore'] }]));
    const noText = await filing('7003', 'Financial Results for the quarter ended September 30, 2026', null);
    expect((await drain()).counts).toEqual({ withheld: 1, skipped: 1 });
    expect((await db.query('SELECT count(*)::int AS n FROM story_summary WHERE story_id = ANY($1::bigint[])', [[story, noText]])).rows[0].n).toBe(0);
    const call = (await db.query(`SELECT outcome, checks FROM ai_call WHERE story_id = $1`, [story])).rows[0];
    expect(call.outcome).toBe('withheld');
    expect(call.checks.failures.map((f: any) => f.check)).toContain('G3');
  });

  it('withhold rate above 20% alerts the operator once a day', async () => {
    for (let i = 0; i < 4; i++) {
      await filing(`71${i}`, 'Financial Results for the quarter ended September 30, 2026', FILING_TEXT);
      fake.summaryReplies.push(ok([{ text: 'Investors should buy.', citedText: ['x'] }]));
    }
    await drain();
    expect(mailer.sent.filter((m) => m.subject.includes('withhold rate'))).toHaveLength(1);
    expect((await db.query(`SELECT count(*)::int AS n FROM audit_log WHERE action = 'ai.withhold_rate'`)).rows[0].n).toBe(1);
  });

  it('spend cap: 80% warns once; at 100% summaries pause and classification stays rules-only', async () => {
    const spent = (await db.query(`SELECT sum(cost_inr)::float8 AS s FROM ai_call`)).rows[0].s as number;
    await db.query(`UPDATE setting SET value = to_jsonb($1::numeric) WHERE key = 'ai_monthly_cap_inr'`, [spent / 0.85]);
    const { item_id } = await article('cap-1', 'Halcyon secures order from port trust');
    fake.classifyReplies.push(ok({ event_types: ['order_contract'], instruments: [] }));
    expect((await drain()).counts).toEqual({ accepted: 1 });
    expect(mailer.sent.map((m) => m.subject)).toContain('[StockPanic] AI spend passed 80% of the monthly cap');

    await db.query(`UPDATE setting SET value = to_jsonb($1::numeric) WHERE key = 'ai_monthly_cap_inr'`, [spent / 2]);
    await article('cap-2', 'Halcyon wins order from airport authority');
    await filing('7200', 'Financial Results for the quarter ended September 30, 2026', FILING_TEXT);
    expect((await drain()).counts).toEqual({ capped: 2 });
    expect(fake.seen.length).toBe(1); // no further model calls
    expect(mailer.sent.filter((m) => m.subject.includes('reached the monthly cap'))).toHaveLength(1);
    expect((await db.query('SELECT classifier FROM item_analysis WHERE item_id = $1', [item_id])).rows[0].classifier).toBe('model');
  });
});
