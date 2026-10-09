import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addRssSource, listEnabledSources, listPendingRelevance, reviewRelevanceCandidate, setSourceEnabled, storeCandidates } from './ingestion.ts';
import { migrate } from './migrate.ts';

// Registering publisher feeds (admin.ts add-source). Publisher and URLs are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];

describe.skipIf(!adminUrl)('RSS source registration (PostgreSQL)', () => {
  const dbName = `sp_src_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let testUrl: string;
  const feed = { sourceId: 'src_example_markets', name: 'Example Daily (markets)', tier: 2, articleScope: 'markets' as const, url: 'https://news.example.in/markets/rss', accessBasis: 'https://news.example.in/terms (read 2026-10-04)' };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    testUrl=url.toString();
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('adds an enabled, headlines-only feed that the scheduler picks up at the architecture cadence, and audits it', async () => {
    await addRssSource(db, feed);
    const row = (await db.query(`SELECT enabled, excerpt_allowed, article_scope, access_checked_on IS NOT NULL AS checked, adapter FROM source WHERE source_id = $1`, [feed.sourceId])).rows[0];
    expect(row).toMatchObject({ enabled: true, excerpt_allowed: false, article_scope: 'markets', checked: true, adapter: { type: 'rss', url: feed.url } });
    const listed = (await listEnabledSources(db)).find((s) => s.sourceId === feed.sourceId)!;
    expect(listed.cadence.sessions.open).toEqual({ pollSeconds: 60, expectUpdates: true });
    expect(listed.cadence.sessions.closed).toEqual({ pollSeconds: 300, expectUpdates: true });
    const audit = await db.query(`SELECT action FROM audit_log WHERE entity_type = 'source' AND entity_id = $1`, [feed.sourceId]);
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it('refuses bad input before it reaches the scheduler', async () => {
    const bad: [Partial<typeof feed>, RegExp][] = [
      [{ sourceId: 'Example' }, /source id/],
      [{ tier: 1 }, /tier 2, 3 or 4/],
      [{ url: 'http://news.example.in/rss' }, /https/],
      [{ url: 'not a url' }, /not a URL/],
      [{ accessBasis: '  ' }, /access basis/],
      [{}, /already exists/],
    ];
    for (const [change, message] of bad) await expect(addRssSource(db, { ...feed, ...change })).rejects.toThrow(message);
  });

  it('switching a feed off stops fetching it; its row stays', async () => {
    expect(await setSourceEnabled(db, feed.sourceId, false)).toBe(true);
    expect((await listEnabledSources(db)).some((s) => s.sourceId === feed.sourceId)).toBe(false);
    expect(await setSourceEnabled(db, 'src_missing', true)).toBe(false);
  });

  it('holds uncertain RSS headlines for review and publishes an approved headline into the pipeline', async () => {
    await storeCandidates(db, { sourceId: feed.sourceId, kind: 'article', excerptAllowed: false, articleScope: feed.articleScope }, [{
      kind: 'article', dedupKey: 'guid:review-me', headline: 'Example company expands operations in Bengaluru',
      url: 'https://news.example.in/business/example-expansion', publishedAt: new Date('2026-10-05T05:00:00Z'), excerpt: null,
      relevance: { decision: 'review', confidence: 0.5, reason: 'headline needs a human market-relevance decision', rulesVersion: 'market-v1' },
    }]);
    const pending = await listPendingRelevance(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.headline).toContain('expands operations');
    expect(await reviewRelevanceCandidate(db, pending[0]!.id, 'keep', 'test-operator')).toBe('reviewed');
    expect(await listPendingRelevance(db)).toHaveLength(0);
    expect((await db.query(`SELECT count(*)::int AS n FROM item WHERE dedup_key = 'guid:review-me'`)).rows[0].n).toBe(1);
    expect((await db.query(`SELECT count(*)::int AS n FROM job WHERE payload->>'item_id' = (SELECT id::text FROM item WHERE dedup_key = 'guid:review-me')`)).rows[0].n).toBe(1);
    expect(await reviewRelevanceCandidate(db, pending[0]!.id, 'discard', 'test-operator')).toBe('not_pending');
  });
  it('records publisher permission without silently enabling it, and disables revoked access', async () => {
    const directory=await mkdtemp(path.join(tmpdir(),'stockpanic-access-'));
    const file=path.join(directory,'review.json');
    const review={source_id:feed.sourceId,access_basis:'Written publisher approval reference',access_checked_on:'2026-10-09',access_approved:true,excerpt_allowed:true};
    const run=async(value:unknown)=>{
      await writeFile(file,JSON.stringify(value));
      return promisify(execFile)(process.execPath,['src/apps/worker/src/cli/sources.ts','record-access',file],{env:{...process.env,DATABASE_URL:testUrl}});
    };
    try {
      await run(review);
      expect((await db.query('SELECT enabled,excerpt_allowed,adapter FROM source WHERE source_id=$1',[feed.sourceId])).rows[0]).toMatchObject({enabled:false,excerpt_allowed:true,adapter:{access_reviewed:true,url:feed.url,type:'rss'}});
      await setSourceEnabled(db,feed.sourceId,true);
      await run({...review,access_approved:false,excerpt_allowed:false});
      expect((await db.query('SELECT enabled,excerpt_allowed,adapter FROM source WHERE source_id=$1',[feed.sourceId])).rows[0]).toMatchObject({enabled:false,excerpt_allowed:false,adapter:{access_reviewed:false}});
      expect((await db.query(`SELECT "after" FROM audit_log WHERE entity_type='source' AND entity_id=$1 AND "after"->'adapter'->>'access_reviewed'='false'`,[feed.sourceId])).rowCount).toBeGreaterThan(0);
    } finally {await unlink(file);await rmdir(directory);}
  });
});
