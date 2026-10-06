import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@stockpanic/db';
import { MALFORMED, RSS_MIXED_QUALITY, RSS_THREE_ITEMS, RSS_TWO_ITEMS } from './fixtures.ts';
import { tick } from './scheduler.ts';

const adminUrl = process.env['TEST_DATABASE_URL'];

const CADENCE = {
  pre_open: { poll_s: 60, expect: true },
  open: { poll_s: 60, expect: true },
  closed: { poll_s: 300, expect: true },
  holiday: { poll_s: 300, expect: false },
  special: { poll_s: 60, expect: true },
  halted: { poll_s: 60, expect: true },
  max_quiet_s: null,
};

describe.skipIf(!adminUrl)('ingestion end-to-end (local feed server + PostgreSQL)', () => {
  const dbName = `sp_ingest_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  let feed = { body: RSS_TWO_ITEMS, etag: '"v1"', status: 200 };
  let feedUrl = '';
  const server = createServer((req, res) => {
    if (feed.status !== 200) {
      res.writeHead(feed.status).end();
      return;
    }
    if (req.headers['if-none-match'] === feed.etag) {
      res.writeHead(304).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/rss+xml', etag: feed.etag }).end(feed.body);
  });

  const t0 = new Date(Math.floor(Date.now() / 1000) * 1000);
  const at = (s: number) => new Date(t0.getTime() + s * 1000);
  const deps = { jitter: () => 1 };
  const health = async (id: string) =>
    (await db.query('SELECT state, consecutive_failures FROM source_health WHERE source_id = $1', [id])).rows[0];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);

    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    feedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed.xml`;

    await db.query(
      `INSERT INTO trading_session (exchange_date, session, starts_at, ends_at) VALUES ($1::date, 'open', $2, $3)`,
      [t0.toISOString().slice(0, 10), at(-60), at(3_600)],
    );
    await db.query(
      `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter, article_scope)
       VALUES ('src_test_desk', 'Example Markets Desk', 'article', 3, 'https://news.example.in/terms', current_date, true, $1, $2, 'business')`,
      [CADENCE, { type: 'rss', url: feedUrl }],
    );
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('first fetch stores items and enqueues one pipeline job per item', async () => {
    const r = await tick(db, t0, deps);
    expect(r.session).toBe('open');
    expect(r.calendarMissing).toBe(false);
    expect(r.fetched).toEqual([
      expect.objectContaining({ sourceId: 'src_test_desk', outcome: 'new_items', inserted: 2, duplicates: 0, nextFetchAt: at(60) }),
    ]);
    const items = await db.query(`SELECT headline, url, dedup_key, excerpt FROM item ORDER BY dedup_key`);
    expect(items.rows.map((i) => i.dedup_key)).toEqual(['guid:ex-1001', 'guid:ex-1002']);
    expect(items.rows[0].url).toBe('https://news.example.in/markets/asterion-q2');
    expect(items.rows.every((i) => i.excerpt === null)).toBe(true);
    const jobs = await db.query(`SELECT queue, priority FROM job`);
    expect(jobs.rows).toEqual([
      { queue: 'pipeline', priority: 0 },
      { queue: 'pipeline', priority: 0 },
    ]);
    const state = await db.query(`SELECT etag FROM source_fetch_state WHERE source_id = 'src_test_desk'`);
    expect(state.rows[0].etag).toBe('"v1"');
  });

  it('does not fetch before the source is due', async () => {
    expect((await tick(db, at(10), deps)).fetched).toEqual([]);
  });

  it('uses the stored ETag and handles 304 Not Modified', async () => {
    const r = await tick(db, at(61), deps);
    expect(r.fetched[0]).toMatchObject({ outcome: 'not_modified', inserted: 0 });
  });

  it('stores only the new item when the feed changes', async () => {
    feed = { body: RSS_THREE_ITEMS, etag: '"v2"', status: 200 };
    const r = await tick(db, at(122), deps);
    expect(r.fetched[0]).toMatchObject({ outcome: 'new_items', inserted: 1, duplicates: 2 });
    expect((await db.query('SELECT count(*)::int AS n FROM item')).rows[0].n).toBe(3);
    expect((await db.query('SELECT count(*)::int AS n FROM job')).rows[0].n).toBe(3);
  });

  it('a malformed feed is a recorded failure, not a crash', async () => {
    feed = { body: MALFORMED, etag: '"v3"', status: 200 };
    const r = await tick(db, at(183), deps);
    expect(r.fetched[0]).toMatchObject({ outcome: 'error', error: 'malformed XML' });
    expect(await health('src_test_desk')).toEqual({ state: 'healthy', consecutive_failures: 1 });
  });

  it('goes stale after 3× cadence without a successful fetch, with live event and audit row', async () => {
    feed = { body: '', etag: '"v4"', status: 503 };
    await tick(db, at(244), deps);
    const r = await tick(db, at(305), deps); // last success at +122 → 183 s > 3 × 60
    expect(r.healthChanges).toEqual([{ sourceId: 'src_test_desk', from: 'healthy', to: 'stale' }]);
    expect(await health('src_test_desk')).toMatchObject({ state: 'stale' });

    const ev = await db.query(`SELECT type, payload FROM live_event WHERE type = 'source.health'`);
    expect(ev.rows).toEqual([{ type: 'source.health', payload: { source_id: 'src_test_desk', health: 'stale' } }]);
    // Source configuration changes are audited too (migration 0012); this test is about health.
    const audit = await db.query(`SELECT action, before, after FROM audit_log WHERE entity_id = 'src_test_desk' AND action = 'source.health_changed'`);
    expect(audit.rows).toEqual([{ action: 'source.health_changed', before: { state: 'healthy' }, after: { state: 'stale' } }]);
  });

  it('recovers to healthy on the next successful fetch', async () => {
    feed = { body: RSS_THREE_ITEMS, etag: '"v5"', status: 200 };
    const r = await tick(db, at(366), deps);
    expect(r.fetched[0]).toMatchObject({ outcome: 'no_new_items', duplicates: 3 });
    expect(r.healthChanges).toEqual([{ sourceId: 'src_test_desk', from: 'stale', to: 'healthy' }]);
    expect(await health('src_test_desk')).toEqual({ state: 'healthy', consecutive_failures: 0 });
  });

  it('discards non-English and invalid entries', async () => {
    feed = { body: RSS_MIXED_QUALITY, etag: '"v6"', status: 200 };
    const r = await tick(db, at(427), deps);
    expect(r.fetched[0]).toMatchObject({ inserted: 1, discardedNonEnglish: 1, discardedInvalid: 2 });
  });

  it('falls back to closed cadence and flags a missing calendar', async () => {
    const r = await tick(db, at(7_200), deps);
    expect(r.calendarMissing).toBe(true);
    expect(r.session).toBe('closed');
  });

  it('a source without an access basis cannot be enabled', async () => {
    await expect(
      db.query(
        `INSERT INTO source (source_id, name, kind, tier, enabled, cadence, adapter)
         VALUES ('src_no_basis', 'No basis', 'article', 4, true, $1, $2)`,
        [CADENCE, { type: 'rss', url: feedUrl }],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
