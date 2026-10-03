import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALERT_FIELDS, BANNED_ALERT_LANGUAGE, isinCheckDigit, newPublicId } from '@stockpanic/core';
import type { EventTypeCode } from '@stockpanic/core';
import { ALERTS_QUEUE, createStory, enqueueAlertEvaluation, migrate, setStoryDerived } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import type { Mailer } from '@stockpanic/mail';
import { MemoryPusher } from '@stockpanic/push';
import { drainAlertJobs, evaluateStory, issueCorrections, runDigests } from './deliver.ts';
import type { AlertDeps } from './deliver.ts';

// All companies, people and headlines are fictional.
const adminUrl = process.env['TEST_DATABASE_URL'];
const isin = (b: string) => `IN${b}${isinCheckDigit(`IN${b}`)}`;
const A = isin('E00AST101');
const K = isin('E00KES101');
const IST = (d: string, hhmm: string) => new Date(`${d}T${hhmm}:00+05:30`);

describe.skipIf(!adminUrl)('alerts end-to-end (PostgreSQL)', () => {
  const dbName = `sp_alerts_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const mailer = new MemoryMailer();
  const pusher = new MemoryPusher();
  const deps: AlertDeps = { mailer, pusher, baseUrl: 'https://stockpanic.example', authSecret: 'test-secret-that-is-at-least-32-chars!!' };
  const users: Record<string, string> = {};
  const day = '2026-10-05';
  const morning = IST(day, '10:00');
  let storySeq = 0;

  const user = async (name: string, opts: { push?: boolean; digestOnly?: boolean } = {}) => {
    const { rows } = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at)
       VALUES ($1, $2, $3, now(), now(), now(), now()) RETURNING id`,
      [newPublicId('us'), name, `${name}@example.invalid`],
    );
    users[name] = String(rows[0].id);
    if (opts.push || opts.digestOnly) {
      await db.query(`INSERT INTO alert_settings (user_id, daily_budget, push_enabled, digest_only) VALUES ($1, 5, $2, $3)`, [rows[0].id, !!opts.push, !!opts.digestOnly]);
    }
    return users[name]!;
  };
  const watch = (u: string, i: string, addedAt = new Date('2026-10-01T00:00:00Z')) =>
    db.query('INSERT INTO watchlist_entry (user_id, isin, added_at) VALUES ($1, $2, $3)', [users[u], i, addedAt]);

  const story = async (tagIsin: string, types: EventTypeCode[], firstSeen: Date, headline = `Invented filing ${++storySeq}`) => {
    const item = await db.query(
      `INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, first_seen_at) VALUES ($1, 'filing', 'src_bse_ann', $2, $3, 'https://example.invalid/f', $4) RETURNING id`,
      [newPublicId('it'), `k${randomBytes(4).toString('hex')}`, headline, firstSeen],
    );
    await db.query('BEGIN');
    const id = await createStory(db, String(item.rows[0].id), firstSeen);
    await setStoryDerived(db, id, { primaryItemId: String(item.rows[0].id), sourceCount: 1, eventTypes: types, tags: [{ isin: tagIsin, method: 'exchange_code' }], unresolved: [] });
    await db.query('COMMIT');
    return id;
  };
  const alertsOf = async (u: string) => (await db.query(`SELECT via, sent_at IS NOT NULL AS sent, kind FROM alert WHERE user_id = $1 ORDER BY id`, [users[u]])).rows;
  const mailsTo = (u: string) => mailer.sent.filter((m) => m.to === `${u}@example.invalid`);

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    db = new pg.Client({ connectionString: url.toString() });
    await db.connect();
    await migrate(db);
    for (const [i, nse] of [[A, 'ASTERION'], [K, 'KESTREL']] as const) {
      await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [i]);
      await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ($1, 'NSE', $2, '[2020-01-01,)')`, [i, nse]);
    }
    await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_bse_ann', 'BSE Announcements', 'filing', 1, '{}')`);
    await user('alice');
    await user('bob');
    await user('carol', { push: true });
    await user('dave');
    await user('erin', { digestOnly: true });
    await watch('alice', A);
    await watch('bob', K);
    await watch('carol', A);
    await watch('dave', A, IST(day, '09:45')); // added after the story below appeared
    await watch('erin', A);
    await db.query(`INSERT INTO push_subscription (user_id, endpoint, keys) VALUES ($1, 'https://push.example.invalid/carol', '{"p256dh":"p","auth":"a"}')`, [users['carol']]);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  let first = '';

  it('alerts exactly the users watching the company, by their chosen channel', async () => {
    first = await story(A, ['results'], IST(day, '09:30'), 'Financial Results for the quarter ended September 30, 2026');
    const r = await evaluateStory(db, first, deps, morning);
    expect(r).toEqual({ individual: 2, digest: 1, alreadyAlerted: 0 });
    expect(await alertsOf('alice')).toEqual([{ via: 'individual', sent: true, kind: 'alert' }]);
    expect(await alertsOf('carol')).toEqual([{ via: 'individual', sent: true, kind: 'alert' }]);
    expect(await alertsOf('erin')).toEqual([{ via: 'digest', sent: false, kind: 'alert' }]); // digest-only
    expect(await alertsOf('bob')).toEqual([]); // C-003.2: not on his watchlist
    expect(await alertsOf('dave')).toEqual([]); // added after the story (§7: no retroactive alerts)
    expect(pusher.sent).toHaveLength(1);
  });

  it('alert content is the allow-list only, with no urgency language (C-003.1, C-003.5)', async () => {
    const mail = mailsTo('alice')[0]!;
    expect(mail.subject).toBe('ASTERION: Financial Results for the quarter ended September 30, 2026');
    expect(mail.text).toContain('https://stockpanic.example/s/');
    expect(mail.text).not.toMatch(/community|bullish|bearish|price/i);
    expect(`${mail.subject}${mail.text}`).not.toMatch(BANNED_ALERT_LANGUAGE);
    expect(mail.headers?.['List-Unsubscribe']).toMatch(/\/v1\/alerts\/unsubscribe\?token=/);
    const push = JSON.parse(pusher.sent[0]!.payload);
    expect(Object.keys(push).every((k) => (ALERT_FIELDS as readonly string[]).includes(k))).toBe(true);
  });

  it('re-evaluating the same story never alerts twice (NFR-003.6)', async () => {
    const before = mailer.sent.length;
    expect(await evaluateStory(db, first, deps, morning)).toEqual({ individual: 0, digest: 0, alreadyAlerted: 3 });
    expect(mailer.sent.length).toBe(before);
  });

  it('event types that default off do not alert until the user turns them on', async () => {
    const tw = await story(A, ['trading_window'], IST(day, '09:31'));
    expect(await evaluateStory(db, tw, deps, morning)).toEqual({ individual: 0, digest: 0, alreadyAlerted: 0 });
    await db.query(`INSERT INTO alert_event_type_pref (user_id, code, enabled) VALUES ($1, 'trading_window', true)`, [users['alice']]);
    const tw2 = await story(A, ['trading_window'], IST(day, '09:32'));
    expect((await evaluateStory(db, tw2, deps, morning)).individual).toBe(1);
  });

  it('votes never create alert work (C-003.3)', async () => {
    const jobsBefore = (await db.query(`SELECT count(*)::int AS n FROM job WHERE queue = $1`, [ALERTS_QUEUE])).rows[0].n;
    await db.query(`INSERT INTO vote_directional (story_id, user_id, direction) VALUES ($1, $2, 'bullish')`, [first, users['bob']]);
    await db.query(`INSERT INTO vote_quality (story_id, user_id, kind) VALUES ($1, $2, 'important')`, [first, users['bob']]);
    expect((await db.query(`SELECT count(*)::int AS n FROM job WHERE queue = $1`, [ALERTS_QUEUE])).rows[0].n).toBe(jobsBefore);
  });

  it('beyond the daily budget alerts go to the digest; individual + digest = every alert-worthy story (C-003.4)', async () => {
    // alice has used 2 of her free budget of 5 so far today.
    for (let i = 0; i < 5; i++) {
      const s = await story(A, ['results'], IST(day, `09:4${i}`));
      await enqueueAlertEvaluation(db, s);
    }
    await drainAlertJobs(db, deps, 'test', () => morning);
    const rows = await alertsOf('alice');
    expect(rows.filter((r) => r.via === 'individual')).toHaveLength(5);
    expect(rows.filter((r) => r.via === 'digest')).toHaveLength(2);
    expect(rows).toHaveLength(7); // 7 alert-worthy stories for alice, none dropped

    const digestsBefore = mailsTo('alice').length;
    // alice (2 over budget), erin (digest-only) and carol (her 6th Asterion story today) have held alerts.
    expect(await runDigests(db, deps, IST(day, '10:05'))).toBe(3);
    const digest = mailsTo('alice').at(-1)!;
    expect(mailsTo('alice').length).toBe(digestsBefore + 1);
    expect(digest.subject).toBe('Your StockPanic digest');
    expect(digest.text).toMatch(/^2 stories about your watchlist/);
    expect((await alertsOf('alice')).every((r) => r.sent)).toBe(true);
    expect(await runDigests(db, deps, IST(day, '10:06'))).toBe(0); // once per day
  });

  it('stories during quiet hours are held for the digest', async () => {
    const night = await story(K, ['order_contract'], IST(day, '22:30'));
    expect(await evaluateStory(db, night, deps, IST(day, '23:00'))).toEqual({ individual: 0, digest: 1, alreadyAlerted: 0 });
    expect(await alertsOf('bob')).toEqual([{ via: 'digest', sent: false, kind: 'alert' }]);
  });

  it('a withdrawn push subscription is deleted', async () => {
    pusher.gone.add('https://push.example.invalid/carol');
    await db.query(`UPDATE alert_settings SET email_enabled = false WHERE user_id = $1`, [users['carol']]);
    // Next IST day: carol used her whole budget yesterday, so today's story is delivered individually.
    const s = await story(A, ['dividend'], IST('2026-10-06', '09:50'));
    await evaluateStory(db, s, deps, IST('2026-10-06', '10:00'));
    expect((await db.query('SELECT count(*)::int AS n FROM push_subscription WHERE user_id = $1', [users['carol']])).rows[0].n).toBe(0);
    expect((await alertsOf('carol')).at(-1)).toEqual({ via: 'digest', sent: false, kind: 'alert' }); // nothing delivered → digest
  });

  it('three failed email sends disable email alerts', async () => {
    const failing: Mailer = { send: async () => Promise.reject(new Error('550 rejected')) };
    await user('frank');
    await watch('frank', K);
    await db.query(`INSERT INTO alert_settings (user_id, daily_budget) VALUES ($1, 5)`, [users['frank']]);
    for (let i = 0; i < 3; i++) await evaluateStory(db, await story(K, ['order_contract'], IST(day, `09:5${i}`)), { ...deps, mailer: failing }, morning);
    expect((await db.query('SELECT email_enabled, email_bounces FROM alert_settings WHERE user_id = $1', [users['frank']])).rows[0]).toEqual({ email_enabled: false, email_bounces: 3 });
  });

  it('after a downgrade only the 20 most recently added companies alert (PRD-007 US-007.9)', async () => {
    await user('gina');
    const oldest = isin('E00OLD001');
    await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [oldest]);
    await watch('gina', oldest, new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 20; i++) {
      const extra = isin(`E00X${String(i).padStart(2, '0')}001`);
      await db.query(`INSERT INTO instrument (isin, segment) VALUES ($1, 'mainboard')`, [extra]);
      await watch('gina', extra, new Date(Date.UTC(2026, 1, 1 + i)));
    }
    const s = await story(oldest, ['results'], IST(day, '09:55'));
    await evaluateStory(db, s, deps, morning);
    expect(await alertsOf('gina')).toEqual([]);
  });

  it('removing the tag that caused alerts sends correction notices (PRD-003 US-003.8)', async () => {
    const s = await story(K, ['order_contract'], IST(day, '11:00'));
    await evaluateStory(db, s, deps, IST(day, '11:05'));
    await db.query(`DELETE FROM story_tag WHERE story_id = $1 AND isin = $2`, [s, K]);
    expect(await issueCorrections(db, s, K, deps, IST(day, '11:30'))).toBeGreaterThan(0);
    const correction = mailer.sent.at(-1)!;
    expect(correction.subject).toMatch(/^Correction: /);
    expect(correction.text).toContain(`was not about ${K}`);
  });
});
