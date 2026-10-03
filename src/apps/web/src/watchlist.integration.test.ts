import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, isinCheckDigit, newPublicId, newToken, unsubscribeToken, upgradeRequired } from '@stockpanic/core';
import { createSession, createStory, migrate, setStoryDerived } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { route } from './api.ts';
import type { AuthDeps } from './auth.ts';
import { createApiServer } from './server.ts';

// All companies, people and headlines are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');
const K = isin('E00KES101');

describe.skipIf(!adminUrl)('watchlist, alert settings, unread (PostgreSQL)', () => {
  const dbName = `sp_watch_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const deps: AuthDeps = { mailer: new MemoryMailer(), authSecret: 'test-secret-that-is-at-least-32-chars!!', google: null };
  let token = '';
  let userId = '';
  let userPublicId = '';
  const call = (method: string, path: string, body: unknown = null, t: string | null = token) =>
    route(db, method, new URL(`http://test${path}`), new Date(), { body, sessionToken: t }, deps);
  const b = (r: { body: unknown }) => r.body as any;

  const story = async (tag: string, headline: string, firstSeen: Date) => {
    const item = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, first_seen_at) VALUES ($1, 'article', 'src_desk', $2, $3, 'https://example.invalid/a', $4) RETURNING id`,
      [newPublicId('it'), randomBytes(4).toString('hex'), headline, firstSeen],
    );
    await db.query('BEGIN');
    const id = await createStory(db, String(item.rows[0].id), firstSeen);
    await setStoryDerived(db, id, { primaryItemId: String(item.rows[0].id), sourceCount: 1, eventTypes: ['results'], tags: [{ isin: tag, method: 'rule' }], unresolved: [] });
    await db.query('COMMIT');
    return (await db.query('SELECT public_id FROM story WHERE id = $1', [id])).rows[0].public_id as string;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    for (const [i, nse, name] of [[A, 'ASTERION', 'Asterion Industries Limited'], [K, 'KESTREL', 'Kestrel Power Limited']] as const) {
      await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [i]);
      await db.query(`INSERT INTO instrument_name (isin, kind, name, valid) VALUES ($1, 'legal', $2, '[2020-01-01,)')`, [i, name]);
      await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'NSE', $2, '[2020-01-01,)')`, [i, nse]);
    }
    for (let n = 0; n < 20; n++) await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [isin(`E00F${String(n).padStart(2, '0')}001`)]);
    await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_desk', 'Example Desk', 'article', 3, '{}')`);
    const u = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at)
       VALUES ($1, 'watcher', 'watcher@example.invalid', now(), now(), now(), now()) RETURNING id, public_id`,
      [newPublicId('us')],
    );
    userId = String(u.rows[0].id);
    userPublicId = u.rows[0].public_id;
    token = newToken();
    await createSession(db, hashToken(token), userId, new Date());
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  describe('watchlist (PRD-003 §2)', () => {
    it('add, list, duplicate, unknown, invalid, remove', async () => {
      expect((await call('POST', '/v1/watchlist', { isin: A })).status).toBe(201);
      expect((await call('POST', '/v1/watchlist', { isin: A })).status).toBe(409);
      expect((await call('POST', '/v1/watchlist', { isin: isin('E00ZZZ999') })).status).toBe(404);
      expect((await call('POST', '/v1/watchlist', { isin: 'RELIANCE' })).status).toBe(400);
      const list = b(await call('GET', '/v1/watchlist'));
      expect(list).toMatchObject({ limit: 20, instruments: [{ isin: A, display_symbol: 'ASTERION', name: 'Asterion Industries Limited', status: 'listed' }] });
      expect((await call('DELETE', `/v1/watchlist/${A}`)).status).toBe(204);
      expect((await call('DELETE', `/v1/watchlist/${A}`)).status).toBe(404);
      expect((await call('GET', '/v1/watchlist', null, null)).status).toBe(401);
    });

    it('a merged company stays on the list and names its successor, which is not added (US-003.4 AC-3)', async () => {
      const M = isin('E00F00001');
      expect((await call('POST', '/v1/watchlist', { isin: M })).status).toBe(201);
      await db.query(`UPDATE instrument SET status = 'merged', successor_isin = $2 WHERE isin = $1`, [M, K]);
      expect(b(await call('GET', '/v1/watchlist')).instruments).toMatchObject([{ isin: M, status: 'merged', successor_isin: K }]);
      await db.query(`UPDATE instrument SET status = 'listed', successor_isin = NULL WHERE isin = $1`, [M]);
      await db.query('DELETE FROM watchlist_entry WHERE user_id = $1', [userId]);
    });

    it('the free tier stops at 20 with the standard 402 body', async () => {
      for (let n = 0; n < 20; n++) expect((await call('POST', '/v1/watchlist', { isin: isin(`E00F${String(n).padStart(2, '0')}001`) })).status).toBe(201);
      expect(await call('POST', '/v1/watchlist', { isin: A })).toMatchObject({ status: 402, body: upgradeRequired('watchlist_limit') });
      await db.query('DELETE FROM watchlist_entry WHERE user_id = $1', [userId]);
    });

    it('CSV import: preview, confirm; only ISINs are stored (C-003.6)', async () => {
      const csv = `Instrument,ISIN,Qty.,Avg. cost,LTP\nASTERION,${A},37,4123.55,4200\nKESTREL,,12,987.65,990\nNOTREAL,,1,1,1\n`;
      const preview = b(await call('POST', '/v1/watchlist/import/preview', { csv }));
      expect(preview.matched.map((m: any) => m.isin)).toEqual([A, K]);
      expect(preview.unmatched).toEqual([{ row: 4, raw: 'NOTREAL' }]);
      expect(preview.over_limit).toBe(0);
      expect(b(await call('POST', '/v1/watchlist/import/confirm', { isins: [A, K] }))).toEqual({ added: 2, skipped_existing: 0, skipped_over_limit: 0 });
      expect(b(await call('POST', '/v1/watchlist/import/confirm', { isins: [A] }))).toEqual({ added: 0, skipped_existing: 1, skipped_over_limit: 0 });
      // Timestamps and ids are left out of the dump: their digits can contain the numbers by chance.
      const entries = (await db.query(`SELECT * FROM watchlist_entry`)).rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !(v instanceof Date) && !/(^|_)id$/.test(k))));
      const dump = JSON.stringify(entries) + JSON.stringify((await db.query(`SELECT before, after FROM audit_log`)).rows);
      expect(dump).not.toMatch(/4123|987\.65|\b37\b/);
      expect((await call('POST', '/v1/watchlist/import/preview', { csv: 'Name,Qty\nX,1' })).body).toMatchObject({ error: 'unrecognised_format' });
    });
  });

  describe('alert settings and history (PRD-003 §5.3, §5.5)', () => {
    it('defaults follow the tier and the taxonomy', async () => {
      const s = b(await call('GET', '/v1/alerts/settings'));
      expect(s).toMatchObject({
        channels: { email: true, push: false },
        daily_budget: 5,
        budget_ceiling: 5,
        used_today: 0,
        quiet_hours: { enabled: true, start: '22:00', end: '08:00', tz: 'Asia/Kolkata' },
        digest: { time: '08:00', digest_only: false },
      });
      expect(s.event_types.results).toBe(true);
      expect(s.event_types.trading_window).toBe(false);
    });

    it('updates are validated', async () => {
      const r = b(await call('PUT', '/v1/alerts/settings', { daily_budget: 3, quiet_hours: { start: '23:00' }, event_types: { trading_window: true } }));
      expect(r).toMatchObject({ daily_budget: 3, quiet_hours: { start: '23:00' } });
      expect(r.event_types.trading_window).toBe(true);
      expect(b(await call('PUT', '/v1/alerts/settings', { daily_budget: 6 })).param).toBe('daily_budget'); // above free ceiling
      expect(b(await call('PUT', '/v1/alerts/settings', { quiet_hours: { start: '25:00' } })).param).toBe('quiet_hours');
      expect(b(await call('PUT', '/v1/alerts/settings', { event_types: { order_win: true } })).param).toBe('event_types');
    });

    it('history lists the user’s alerts', async () => {
      const pub = await story(A, 'Invented results filing', new Date(Date.now() - 3600_000));
      const sid = (await db.query('SELECT id FROM story WHERE public_id = $1', [pub])).rows[0].id;
      await db.query(`INSERT INTO alert (public_id, user_id, story_id, kind, via, channels, sent_at) VALUES ($1, $2, $3, 'alert', 'individual', ARRAY['email'], now())`, [newPublicId('al'), userId, sid]);
      expect(b(await call('GET', '/v1/alerts/history')).alerts).toEqual([
        expect.objectContaining({ story_id: pub, headline: 'Invented results filing', channels: ['email'], via: 'individual', corrected: false }),
      ]);
    });
  });

  describe('Watchlist view and unread marker (PRD-001 US-001.3, US-001.4)', () => {
    it('the Watchlist view shows only watched companies; unread is exact', async () => {
      const t0 = Date.now() - 1800_000;
      const watched = await story(K, 'Kestrel invented order story', new Date(t0));
      const other = await story(isin('E00F05001'), 'Unwatched invented story', new Date(t0 + 1000));
      const w = b(await call('GET', '/v1/stream?view=watchlist'));
      expect(w.stories.map((s: any) => s.story_id)).toContain(watched);
      expect(w.stories.map((s: any) => s.story_id)).not.toContain(other);
      expect((await call('GET', '/v1/stream?view=watchlist', null, null)).status).toBe(401);

      expect((await call('POST', '/v1/stream/seen', { view: 'latest', last_seen_at: new Date(t0 + 500).toISOString() })).status).toBe(204);
      const latest = b(await call('GET', '/v1/stream'));
      expect(latest.unread_count).toBe(1);
      expect(latest.stories.find((s: any) => s.story_id === other).is_unread).toBe(true);
      expect(latest.stories.find((s: any) => s.story_id === watched).is_unread).toBe(false);
      expect(b(await call('GET', '/v1/stream', null, null))).not.toHaveProperty('unread_count');
      expect((await call('POST', '/v1/stream/seen', { view: 'nope', last_seen_at: new Date().toISOString() })).status).toBe(400);
    });
  });

  describe('push subscriptions and unsubscribe', () => {
    it('register and remove a push subscription', async () => {
      const keys = { p256dh: 'p', auth: 'a' };
      expect((await call('POST', '/v1/push/subscriptions', { endpoint: 'https://push.example.invalid/1', keys })).status).toBe(201);
      expect((await call('POST', '/v1/push/subscriptions', { endpoint: 'http://insecure.example', keys })).status).toBe(400);
      expect((await call('DELETE', '/v1/push/subscriptions', { endpoint: 'https://push.example.invalid/1' })).status).toBe(204);
    });

    it('one-click unsubscribe works without signing in; GET only describes it', async () => {
      const t = unsubscribeToken(deps.authSecret, userPublicId);
      expect(b(await call('GET', `/v1/alerts/unsubscribe?token=${encodeURIComponent(t)}`, null, null))).toEqual({ action: 'unsubscribe_email_alerts', method: 'POST' });
      expect(b(await call('GET', '/v1/alerts/settings')).channels.email).toBe(true);
      expect((await call('POST', '/v1/alerts/unsubscribe?token=bad', null, null)).status).toBe(404);

      const url = new URL(adminUrl!);
      url.pathname = `/${dbName}`;
      const pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
      const server = createApiServer(pool, deps);
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      try {
        const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/alerts/unsubscribe?token=${encodeURIComponent(t)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        });
        expect(res.status).toBe(200);
      } finally {
        await new Promise((r) => server.close(r));
        await pool.end();
      }
      expect(b(await call('GET', '/v1/alerts/settings')).channels.email).toBe(false);
    });
  });
});
