import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isinCheckDigit, newPublicId } from '@stockpanic/core';
import { PIPELINE_QUEUE, migrate, storeCandidates } from '@stockpanic/db';
import { buildPipelineContext, drainPipeline } from './runner.ts';

// All companies, headlines and ISINs are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const makeIsin = (body9: string) => {
  const base = `IN${body9}`;
  return `${base}${isinCheckDigit(base)}`;
};
const A = makeIsin('E00AST101');
const K = makeIsin('E00KES101');
const M = makeIsin('E00MER101');
const H1 = makeIsin('E00HAL101');
const H2 = makeIsin('E00HAL201');
const T = makeIsin('E00TRD101');

describe.skipIf(!adminUrl)('pipeline end-to-end (PostgreSQL)', () => {
  const dbName = `sp_pipe_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const t0 = new Date(Date.now() - 3600_000);
  const at = (m: number) => new Date(t0.getTime() + m * 60_000);

  const article = (sourceId: string, key: string, headline: string, minutes: number) =>
    storeCandidates(db, { sourceId, kind: 'article', excerptAllowed: false }, [
      { kind: 'article', dedupKey: key, headline, url: `https://news.example.in/${key}`, publishedAt: at(minutes), excerpt: null },
    ]);

  const filing = async (exchange: 'BSE' | 'NSE', id: string, code: string, subject: string, category: string | null, minutes: number) => {
    const sourceId = exchange === 'BSE' ? 'src_bse_ann' : 'src_nse_ann';
    await db.query('BEGIN');
    const { rows } = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at)
       VALUES ($1, 'filing', $2, $3, $4, $5, $6) RETURNING id`,
      [newPublicId('it'), sourceId, `${exchange}:${id}`, subject, `https://exchange.example.in/${exchange}/${id}`, at(minutes)],
    );
    await db.query('INSERT INTO filing_detail (item_id, exchange, announcement_id, scrip_code, category) VALUES ($1, $2, $3, $4, $5)', [
      rows[0].id,
      exchange,
      id,
      code,
      category,
    ]);
    await db.query(`INSERT INTO job (queue, priority, payload) VALUES ('pipeline', 10, $1)`, [{ item_id: rows[0].id }]);
    await db.query('COMMIT');
  };

  const drain = async () => drainPipeline(db, await buildPipelineContext(db, new Date()), { workerId: 'test' });

  const storyOf = async (dedupKey: string) =>
    (
      await db.query(
        `SELECT s.id, s.source_count, s.first_seen_at, p.dedup_key AS primary_key,
                (SELECT array_agg(code ORDER BY code) FROM story_event_type e WHERE e.story_id = s.id) AS types,
                (SELECT array_agg(isin || ':' || method ORDER BY isin) FROM story_tag g WHERE g.story_id = s.id) AS tags,
                (SELECT array_agg(mention) FROM story_unresolved_mention u WHERE u.story_id = s.id) AS unresolved,
                (SELECT count(*)::int FROM story_item x WHERE x.story_id = s.id) AS items
           FROM item i JOIN story_item si ON si.item_id = i.id JOIN story s ON s.id = si.story_id
           JOIN item p ON p.id = s.primary_item_id
          WHERE i.dedup_key = $1`,
        [dedupKey],
      )
    ).rows[0];

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);

    const instruments: [string, string, string, string][] = [
      [A, 'Asterion Industries Limited', '500101', 'ASTERION'],
      [K, 'Kestrel Power Limited', '500102', 'KESTREL'],
      [M, 'Meridian Textiles Limited', '500103', 'MERIDIAN'],
      [H1, 'Halcyon Motors Limited', '500104', 'HALMOTORS'],
      [H2, 'Halcyon Steel Limited', '500105', 'HALSTEEL'],
      [T, 'Trend Retail Limited', '500106', 'TRENDRET'],
    ];
    for (const [isin, name, bse, nse] of instruments) {
      await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [isin]);
      await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', $2, '[2020-01-01,)')`, [isin, name]);
      await db.query(
        `INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'BSE', $2, '[2020-01-01,)'), ($1, 'NSE', $3, '[2020-01-01,)')`,
        [isin, bse, nse],
      );
    }
    const alias = (isin: string, text: string, commonWord = false) =>
      db.query(
        `INSERT INTO instrument_alias (isin, alias, alias_norm, kind, common_word, valid) VALUES ($1, $2, lower($2), 'curated', $3, '[2020-01-01,)')`,
        [isin, text, commonWord],
      );
    await alias(K, 'Kestrel');
    await alias(H1, 'Halcyon');
    await alias(H2, 'Halcyon');
    await alias(T, 'Trend', true);

    const cadence = JSON.stringify(
      Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map((s) => [s, { poll_s: 60, expect: true }])),
    );
    for (const [id, kind, tier] of [
      ['src_desk_a', 'article', 3],
      ['src_desk_b', 'article', 3],
      ['src_bse_ann', 'filing', 1],
      ['src_nse_ann', 'filing', 1],
    ] as const) {
      await db.query(
        `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter)
         VALUES ($1, $1, $2, $3, 'test', current_date, true, $4, '{"type":"rss","url":"https://example.invalid"}')`,
        [id, kind, tier, cadence],
      );
    }
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('syndicated copies of one story become one story with two sources', async () => {
    await article('src_desk_a', 'orion-a', 'Orion Cables board approves ₹250 crore capex plan', 0);
    await article('src_desk_b', 'orion-b', 'Orion Cables board approves ₹250 crore capex plan', 3);
    await article('src_desk_a', 'orion-c', 'Orion Cables to invest in new plant', 5);
    const r = await drain();
    expect(r).toMatchObject({ processed: 3, created: 2, joined: 1, failed: 0 });
    const s = await storyOf('orion-a');
    expect(s).toMatchObject({ items: 2, source_count: 2, primary_key: 'orion-a', types: ['board_outcome'], tags: null });
    expect((await storyOf('orion-c')).id).not.toBe(s.id);
  });

  it('an article joins the filing it reports on; the filing leads', async () => {
    await filing('BSE', '9001', '500101', 'Financial Results for the quarter ended September 30, 2026', 'Result', 10);
    await drain();
    await article('src_desk_a', 'asterion-q2', 'Asterion Industries Q2 profit rises 18%', 30);
    await drain();
    expect(await storyOf('asterion-q2')).toMatchObject({
      items: 2,
      source_count: 2,
      primary_key: 'BSE:9001',
      types: ['results'],
      tags: [`${A}:exchange_code`],
    });
  });

  it('a filing joins the article story that preceded it, without moving the row', async () => {
    await article('src_desk_b', 'kestrel-bonus', 'Kestrel board approves bonus issue', 40);
    await drain();
    const before = await storyOf('kestrel-bonus');
    expect(before.tags).toEqual([`${K}:rule`]);

    await filing('BSE', '9002', '500102', 'Outcome of Board Meeting - Bonus Issue', null, 50);
    await drain();
    const after = await storyOf('kestrel-bonus');
    expect(after).toMatchObject({ id: before.id, primary_key: 'BSE:9002', tags: [`${K}:exchange_code`] });
    expect(after.types).toEqual(['board_outcome', 'corporate_action']);
    expect(after.first_seen_at).toEqual(before.first_seen_at);
  });

  it('the same announcement on the other exchange joins the story', async () => {
    await filing('NSE', 'N-77', 'KESTREL', 'Outcome of Board Meeting - Bonus Issue', null, 52);
    await drain();
    expect(await storyOf('NSE:N-77')).toMatchObject({ items: 3, source_count: 3, primary_key: 'BSE:9002' });
  });

  it('a name shared by two companies is shown unresolved, never guessed', async () => {
    await article('src_desk_a', 'halcyon', 'Halcyon plans ₹10,000 crore investment', 60);
    await drain();
    expect(await storyOf('halcyon')).toMatchObject({ tags: null, unresolved: ['Halcyon'] });
  });

  it('a common-word alias tags only in ticker casing', async () => {
    await article('src_desk_a', 'trend-word', 'Trend of rising rates worries lenders', 61);
    await article('src_desk_b', 'trend-ticker', 'TREND shares jump after store expansion', 62);
    await drain();
    expect((await storyOf('trend-word')).tags).toBeNull();
    expect((await storyOf('trend-ticker')).tags).toEqual([`${T}:rule`]);
  });

  it('near-identical headlines with conflicting figures stay separate', async () => {
    await article('src_desk_a', 'meridian-412', 'Meridian Textiles Q2 profit at ₹412 crore', 70);
    await article('src_desk_b', 'meridian-500', 'Meridian Textiles Q2 profit at ₹500 crore', 71);
    await drain();
    expect((await storyOf('meridian-412')).id).not.toBe((await storyOf('meridian-500')).id);
  });

  it('every story change was broadcast, and every job completed', async () => {
    const ev = await db.query(`SELECT type, count(*)::int AS n FROM live_event WHERE type LIKE 'story.%' GROUP BY type ORDER BY type`);
    const stories = (await db.query('SELECT count(*)::int AS n FROM story')).rows[0].n;
    const joins = (await db.query('SELECT count(*)::int AS n FROM story_item')).rows[0].n - stories;
    expect(ev.rows).toEqual([
      { type: 'story.created', n: stories },
      { type: 'story.updated', n: joins },
    ]);
    const open = await db.query(`SELECT count(*)::int AS n FROM job WHERE queue = $1 AND completed_at IS NULL`, [PIPELINE_QUEUE]);
    expect(open.rows[0].n).toBe(0);
  });

  it('a job for a missing item fails permanently; re-running a done item is skipped', async () => {
    await db.query(`INSERT INTO job (queue, payload) VALUES ('pipeline', '{"item_id": 999999}')`);
    const done = (await db.query(`SELECT id FROM item WHERE dedup_key = 'orion-a'`)).rows[0].id;
    await db.query(`INSERT INTO job (queue, payload) VALUES ('pipeline', $1)`, [{ item_id: done }]);
    const r = await drain();
    expect(r).toMatchObject({ failed: 1, skipped: 1 });
    const failed = await db.query(`SELECT last_error FROM job WHERE failed_at IS NOT NULL`);
    expect(failed.rows[0].last_error).toBe('item 999999 not found');
  });
});
