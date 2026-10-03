import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, isinCheckDigit, newPublicId, newToken } from '@stockpanic/core';
import { createSession, migrate, recomputeStory, storeCandidates } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { MemoryPusher } from '@stockpanic/push';
import { route } from '../../web/src/api.ts';
import type { AuthDeps } from '../../web/src/auth.ts';
import { drainAlertJobs } from './alerts/deliver.ts';
import { buildPipelineContext, drainPipeline } from './pipeline/runner.ts';

// All companies, people and headlines are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');
const K = isin('E00KES101');

describe.skipIf(!adminUrl)('operator story corrections (PostgreSQL)', () => {
  const dbName = `sp_corr_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const mailer = new MemoryMailer();
  const alertDeps = { mailer, pusher: new MemoryPusher(), baseUrl: 'https://stockpanic.example', authSecret: 'test-secret-that-is-at-least-32-chars!!' };
  const deps: AuthDeps = { mailer, authSecret: alertDeps.authSecret, google: null };
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const call = (who: string, method: string, path: string, body: unknown = null) =>
    route(db, method, new URL(`http://test${path}`), new Date(), { body, sessionToken: tokens[who]! }, deps);
  const b = (r: { body: unknown }) => r.body as any;
  const pipeline = async () => drainPipeline(db, await buildPipelineContext(db, new Date()), { workerId: 'test' });
  const alerts = () => drainAlertJobs(db, alertDeps, 'test');
  const storyOfKey = async (key: string) =>
    (await db.query(`SELECT s.id, s.public_id FROM story s JOIN story_item si ON si.story_id = s.id JOIN item i ON i.id = si.item_id WHERE i.dedup_key = $1`, [key])).rows[0] as { id: string; public_id: string };
  const tagsOf = async (storyId: string) => (await db.query('SELECT isin, method FROM story_tag WHERE story_id = $1 ORDER BY isin', [storyId])).rows.map((r) => `${String(r.isin).trim()}:${r.method}`);

  const user = async (name: string, role: 'user' | 'operator' = 'user') => {
    const u = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at, created_at, totp_enabled, totp_secret_enc)
       VALUES ($1, $2, $3, now(), now(), now(), now(), now() - interval '60 days', $4, $5) RETURNING id`,
      [newPublicId('us'), name, `${name}@example.invalid`, role !== 'user', role !== 'user' ? 'encrypted-test-secret' : null],
    );
    ids[name] = String(u.rows[0].id);
    if (role !== 'user') await db.query('UPDATE app_user SET role = $2 WHERE id = $1', [ids[name], role]);
    tokens[name] = newToken();
    await createSession(db, hashToken(tokens[name]!), ids[name]!, new Date());
    if (role !== 'user') await db.query('UPDATE user_session SET mfa_verified_at = now() WHERE user_id = $1', [ids[name]]);
  };
  const filing = async (id: string, subject: string, code: string) => {
    await db.query('BEGIN');
    const { rows } = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, published_at) VALUES ($1, 'filing', 'src_bse_ann', $2, $3, $4, now()) RETURNING id`,
      [newPublicId('it'), `BSE:${id}`, subject, `https://exchange.example.in/${id}`],
    );
    await db.query(`INSERT INTO filing_detail (item_id, exchange, announcement_id, scrip_code, category) VALUES ($1, 'BSE', $2, $3, 'Board Meeting')`, [rows[0].id, id, code]);
    await db.query(`INSERT INTO job (queue, priority, payload) VALUES ('pipeline', 10, $1)`, [{ item_id: rows[0].id }]);
    await db.query('COMMIT');
  };
  const article = (source: string, key: string, headline: string) =>
    storeCandidates(db, { sourceId: source, kind: 'article', excerptAllowed: false }, [{ kind: 'article', dedupKey: key, headline, url: `https://news.example.in/${key}`, publishedAt: new Date(), excerpt: null }]);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    for (const [i, name, code] of [[A, 'Asterion Industries Limited', '500101'], [K, 'Kestrel Power Limited', '500202']] as const) {
      await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [i]);
      await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', $2, '[2020-01-01,)')`, [i, name]);
      await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'BSE', $2, '[2020-01-01,)')`, [i, code]);
    }
    const cadence = JSON.stringify(Object.fromEntries(['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'].map((s) => [s, { poll_s: 60, expect: true }])));
    for (const [id, kind, tier] of [['src_bse_ann', 'filing', 1], ['src_desk_a', 'article', 3], ['src_desk_b', 'article', 3]] as const) {
      await db.query(
        `INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter)
         VALUES ($1, $1, $2, $3, 'test', current_date, true, $4, '{"type":"rss","url":"https://example.invalid"}')`,
        [id, kind, tier, cadence],
      );
    }
    await user('moderator1', 'operator');
    await user('alice');
    await user('bob');
    await user('carol');
    for (const [u, i] of [['alice', A], ['bob', K]] as const) {
      await db.query(`INSERT INTO watchlist_entry (user_id, isin, added_at) VALUES ($1, $2, now() - interval '1 day')`, [ids[u], i]);
      // Quiet hours off: the test must not depend on the hour it runs (22:00–08:00 IST holds alerts for the digest).
      await db.query(`INSERT INTO alert_settings (user_id, daily_budget, quiet_enabled) VALUES ($1, 5, false) ON CONFLICT (user_id) DO UPDATE SET quiet_enabled = false`, [ids[u]]);
    }
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  describe('retag (US-002.11 AC-4, PRD-003 §3.4)', () => {
    let story: { id: string; public_id: string };

    it('only operators, with a reason and known instruments', async () => {
      await filing('9101', 'Outcome of Board Meeting held on October 3, 2026', '500101'); // tagged Asterion by scrip code
      await pipeline();
      await alerts();
      story = await storyOfKey('BSE:9101');
      expect(mailer.sent.filter((m) => m.to === 'alice@example.invalid')).toHaveLength(1);

      expect((await call('alice', 'POST', `/v1/admin/stories/${story.public_id}/tags`, { remove: [A], reason: 'wrong' })).status).toBe(403);
      expect(b(await call('moderator1', 'POST', `/v1/admin/stories/${story.public_id}/tags`, { remove: [A] }))).toMatchObject({ error: 'invalid_param', param: 'reason' });
      expect(b(await call('moderator1', 'POST', `/v1/admin/stories/${story.public_id}/tags`, { add: ['INE00ZZZ1010'], reason: 'x' }))).toMatchObject({ param: 'add' });
      expect(b(await call('moderator1', 'POST', `/v1/admin/stories/${story.public_id}/tags`, { remove: [K], reason: 'x' }))).toMatchObject({ param: 'remove' });
      expect((await call('moderator1', 'POST', `/v1/admin/stories/st_00000000000000000000000000/tags`, { remove: [A], reason: 'x' })).status).toBe(404);
    });

    it('removes and adds; alerted users get a correction; the new instrument is alerted; audited and labelled', async () => {
      const r = await call('moderator1', 'POST', `/v1/admin/stories/${story.public_id}/tags`, { remove: [A], add: [K], reason: 'Scrip code belongs to Kestrel in this filing' });
      expect(r.status).toBe(200);
      expect(b(r).story.instruments.map((i: any) => i.isin)).toEqual([K]);
      expect(b(r).audit_id).toMatch(/^\d+$/);
      expect(await tagsOf(story.id)).toEqual([`${K}:operator`]);

      const out = await alerts();
      expect(out.corrections).toBe(1);
      const correction = mailer.sent.filter((m) => m.to === 'alice@example.invalid').at(-1)!;
      expect(correction.subject).toMatch(/^Correction: /);
      expect(mailer.sent.filter((m) => m.to === 'bob@example.invalid')).toHaveLength(1);

      const audit = (await db.query(`SELECT before, after FROM audit_log WHERE action = 'story.retagged'`)).rows[0];
      expect(audit.before.tags).toEqual([A]);
      expect(audit.after).toMatchObject({ tags: [K], reason: 'Scrip code belongs to Kestrel in this filing' });
      expect((await db.query(`SELECT kind, isin FROM correction_label ORDER BY id`)).rows.map((x) => `${x.kind}:${String(x.isin).trim()}`)).toEqual([`tag_removed:${A}`, `tag_added:${K}`]);
      expect((await db.query(`SELECT count(*)::int AS n FROM live_event WHERE type = 'story.updated' AND payload->>'story_id' = $1`, [story.public_id])).rows[0].n).toBe(1);
    });

    it('the decision survives recomputation (e.g. a filing revision)', async () => {
      await db.query('BEGIN');
      await recomputeStory(db, story.id);
      await db.query('COMMIT');
      expect(await tagsOf(story.id)).toEqual([`${K}:operator`]);
    });
  });

  describe('merge (US-002.7 AC-1, AC-3)', () => {
    it('the older story survives; items, comments and votes move; the other redirects', async () => {
      await article('src_desk_a', 'm-old', 'Asterion Industries plans new plant in Gujarat');
      await new Promise((r) => setTimeout(r, 20));
      await article('src_desk_b', 'm-new', 'Asterion picks Gujarat site for factory expansion');
      await pipeline();
      const older = await storyOfKey('m-old');
      const newer = await storyOfKey('m-new');
      expect(older.id).not.toBe(newer.id);

      const c = await call('carol', 'POST', `/v1/stories/${newer.public_id}/comments`, { body: 'Site was rumoured last month.' });
      await call('alice', 'POST', `/v1/stories/${newer.public_id}/comments`, { body: 'Source?', parent_id: b(c).comment.comment_id });
      await db.query(`INSERT INTO vote_quality (story_id, user_id, kind, detail) VALUES ($1, $2, 'duplicate', $3), ($1, $4, 'important', NULL), ($5, $4, 'important', NULL)`, [
        newer.id, ids['carol'], JSON.stringify({ story_id: older.public_id }), ids['bob'], older.id,
      ]);

      const r = await call('moderator1', 'POST', `/v1/admin/stories/${newer.public_id}/merge`, { into_story_id: older.public_id, reason: 'Same event' });
      expect(r.status).toBe(200);
      expect(b(r).story.story_id).toBe(older.public_id);
      expect(b(r).story.source_count).toBe(2);
      expect((await call('carol', 'GET', `/v1/stories/${newer.public_id}`)).status).toBe(301);

      const comments = b(await call('carol', 'GET', `/v1/stories/${older.public_id}/comments`)).comments;
      expect(comments).toHaveLength(1);
      expect(comments[0].replies).toHaveLength(1);
      expect((await db.query(`SELECT story_id, user_id, kind FROM vote_quality WHERE story_id = $1 ORDER BY user_id, kind`, [older.id])).rows.length).toBe(2); // carol's duplicate + bob's one important
      expect((await db.query(`SELECT count(*)::int AS n FROM vote_quality WHERE story_id = $1`, [newer.id])).rows[0].n).toBe(1); // bob's second important stays, recorded
      expect((await db.query(`SELECT important FROM story_vote_count WHERE story_id = $1`, [older.id])).rows[0].important).toBe(1);
      const audit = (await db.query(`SELECT before, after FROM audit_log WHERE action = 'story.merged'`)).rows[0];
      expect(audit.after.absorbed).toBe(newer.public_id);
      expect((await call('moderator1', 'POST', `/v1/admin/stories/${newer.public_id}/merge`, { into_story_id: older.public_id, reason: 'again' })).status).toBe(400);
    });
  });

  describe('split (US-002.7 AC-2)', () => {
    it('moves items into a new story at their own time; refuses to empty a story', async () => {
      await article('src_desk_a', 's-1', 'Kestrel Power board approves ₹250 crore capex plan');
      await article('src_desk_b', 's-2', 'Kestrel Power board approves ₹250 crore capex plan');
      await pipeline();
      const s = await storyOfKey('s-1');
      expect((await storyOfKey('s-2')).id).toBe(s.id);
      const items = (await db.query(`SELECT public_id, dedup_key FROM item WHERE dedup_key IN ('s-1', 's-2')`)).rows;
      const moving = items.find((i) => i.dedup_key === 's-2').public_id;

      expect((await call('moderator1', 'POST', `/v1/admin/stories/${s.public_id}/split`, { item_ids: items.map((i) => i.public_id), reason: 'x' })).status).toBe(400);
      expect(b(await call('moderator1', 'POST', `/v1/admin/stories/${s.public_id}/split`, { item_ids: ['it_00000000000000000000000000'], reason: 'x' }))).toMatchObject({ param: 'item_ids' });

      const r = await call('moderator1', 'POST', `/v1/admin/stories/${s.public_id}/split`, { item_ids: [moving], reason: 'Different meeting' });
      expect(r.status).toBe(200);
      expect(b(r).story.source_count).toBe(1);
      expect(b(r).new_story.source_count).toBe(1);
      expect((await storyOfKey('s-2')).public_id).toBe(b(r).new_story.story_id);
      expect((await db.query(`SELECT count(*)::int AS n FROM live_event WHERE type = 'story.created' AND payload->>'story_id' = $1`, [b(r).new_story.story_id])).rows[0].n).toBe(1);
      expect((await db.query(`SELECT kind FROM correction_label WHERE kind = 'split'`)).rows).toHaveLength(1);
    });
  });

  describe('review queue (US-002.11 AC-2, AC-3)', () => {
    it('orders by distinct reporters; applying or dismissing clears it; reports never change tags by themselves', async () => {
      await filing('9201', 'Outcome of Board Meeting held on October 4, 2026', '500202');
      await filing('9202', 'Outcome of Board Meeting held on October 5, 2026', '500101');
      await pipeline();
      const one = await storyOfKey('BSE:9201');
      const two = await storyOfKey('BSE:9202');
      await db.query(
        `INSERT INTO vote_quality (story_id, user_id, kind, detail) VALUES ($1, $3, 'wrong_stock', $5), ($1, $4, 'wrong_stock', $5), ($2, $3, 'wrong_stock', $6)`,
        [one.id, two.id, ids['alice'], ids['carol'], JSON.stringify({ isin: K }), JSON.stringify({ isin: A })],
      );
      const queue = b(await call('moderator1', 'GET', '/v1/admin/corrections')).queue.filter((q: any) => q.kind === 'wrong_stock');
      expect(queue.map((q: any) => [q.story_id, q.reporters])).toEqual([[one.public_id, 2], [two.public_id, 1]]);
      expect(await tagsOf(one.id)).toEqual([`${K}:exchange_code`]); // AC-3: no automatic change

      await call('moderator1', 'POST', `/v1/admin/stories/${one.public_id}/tags`, { remove: [K], reason: 'Confirmed wrong' });
      expect((await call('moderator1', 'POST', `/v1/admin/stories/${two.public_id}/reports/dismiss`, { kind: 'wrong_stock' })).status).toBe(400);
      expect((await call('moderator1', 'POST', `/v1/admin/stories/${two.public_id}/reports/dismiss`, { kind: 'wrong_stock', reason: 'Tag is correct' })).status).toBe(200);
      expect(b(await call('moderator1', 'GET', '/v1/admin/corrections')).queue.filter((q: any) => q.kind === 'wrong_stock')).toEqual([]);

      // A new report after review re-opens the item.
      await db.query(`INSERT INTO vote_quality (story_id, user_id, kind, detail) VALUES ($1, $2, 'wrong_stock', $3)`, [two.id, ids['bob'], JSON.stringify({ isin: A })]);
      expect(b(await call('moderator1', 'GET', '/v1/admin/corrections')).queue.filter((q: any) => q.kind === 'wrong_stock').map((q: any) => q.reporters)).toEqual([1]);
    });
  });
});
