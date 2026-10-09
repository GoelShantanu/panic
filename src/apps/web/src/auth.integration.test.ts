import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken, newToken, newPublicId } from '@stockpanic/core';
import { ACCOUNT_QUEUE, claimJob, completeJob, createPendingSignup, migrate, processDeletion, processExport } from '@stockpanic/db';
import { MemoryMailer } from '@stockpanic/mail';
import { route } from './api.ts';
import type { AuthDeps } from './auth.ts';
import { createGoogleVerifier } from './google.ts';
import type { Jwk } from './google.ts';
import { createApiServer } from './server.ts';

const adminUrl = process.env['TEST_DATABASE_URL'];
const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const PASSWORD = 'An isolated test passphrase';
const signupBody = (email: string) => ({ email, password: PASSWORD, first_name: 'Ada', last_name: 'Lovelace' });
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk: Jwk = { ...(keys.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'k1' };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const googleToken = (sub: string, email: string) => {
  const nowS = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', kid: 'k1' });
  const p = b64({ iss: 'accounts.google.com', aud: CLIENT_ID, sub, email, email_verified: true, hd: 'example.invalid', iat: nowS, exp: nowS + 3600 });
  return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), keys.privateKey).toString('base64url')}`;
};

describe.skipIf(!adminUrl)('accounts (PRD-007) against PostgreSQL', () => {
  const dbName = `sp_auth_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client;
  let db: pg.Client;
  const mailer = new MemoryMailer();
  const deps: AuthDeps = { mailer, authSecret: 'test-secret-that-is-at-least-32-chars!!', google: createGoogleVerifier(CLIENT_ID, async () => [jwk]) };

  const call = (method: string, path: string, body: unknown = null, token: string | null = null) =>
    route(db, method, new URL(`http://test${path}`), new Date(), { body, sessionToken: token }, deps);
  const lastCode = (email: string) => {
    const m = [...mailer.sent].reverse().find((x) => x.to === email);
    return m?.text.match(/\b(\d{6})\b/)?.[1] ?? null;
  };
  const signUp = async (email: string, username: string) => {
    await call('POST', '/v1/auth/password/signup/start', signupBody(email));
    const v = await call('POST', '/v1/auth/password/signup/verify', { email, code: lastCode(email) });
    const done = await call('POST', '/v1/auth/signup/complete', { username, age_confirmed: true, terms_accepted: true, privacy_consent: true }, (v.body as any).session);
    return (done.body as any).session as string;
  };
  const runAccountJobs = async () => {
    for (;;) {
      const job = await claimJob(db, ACCOUNT_QUEUE, 'test');
      if (!job) return;
      await db.query('BEGIN');
      if (job.payload['kind'] === 'delete') await processDeletion(db, String(job.payload['user_id']), new Date());
      else await processExport(db, String(job.payload['export_id']), new Date());
      await completeJob(db, job.id);
      await db.query('COMMIT');
    }
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
    // An instrument whose NSE symbol must be unavailable as a username.
    await db.query(`INSERT INTO instrument (isin, segment) VALUES ('INE000A01011', 'mainboard')`);
    await db.query(`INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ('INE000A01011', 'NSE', 'ASTERION', '[2020-01-01,)')`);
  });

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin?.end();
  });

  it('removed passwordless endpoints cannot send codes or create sessions', async () => {
    const email = 'disabled@example.invalid';
    const sent = mailer.sent.length;
    for (const path of ['/v1/auth/email/start', '/v1/auth/email/verify']) {
      const response = await call('POST', path, { email, code: '123456' });
      expect(response.status).toBe(404);
      expect(response.headers?.['set-cookie']).toBeUndefined();
    }
    expect(mailer.sent.length).toBe(sent);
    expect((await db.query('SELECT 1 FROM email_code WHERE email=$1', [email])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM pending_signup WHERE email=$1', [email])).rowCount).toBe(0);
    // A previously issued onboarding proof cannot bypass the removal either.
    const legacyToken = newToken();
    await createPendingSignup(db, hashToken(legacyToken), { email, googleSub: null }, new Date(Date.now() + 600_000));
    const completed = await call('POST', '/v1/auth/signup/complete', { username: 'retired_code_user', age_confirmed: true, terms_accepted: true, privacy_consent: true }, legacyToken);
    expect(completed.status).toBe(401);
    expect(completed.headers?.['set-cookie']).toContain('Max-Age=0');
    expect((await db.query('SELECT 1 FROM app_user WHERE email=$1', [email])).rowCount).toBe(0);
  });

  describe('verified email sign-up and password sign-in', () => {
    const email = 'first@example.invalid';
    let pending = '';

    it('start always answers 204 and mails a 6-digit code; the code is stored only as a hash', async () => {
      expect((await call('POST', '/v1/auth/password/signup/start', signupBody(' First@Example.invalid '))).status).toBe(204);
      expect(lastCode(email)).toMatch(/^\d{6}$/);
      const stored = await db.query('SELECT code_hash FROM auth_challenge WHERE email = $1', [email]);
      expect(stored.rows[0].code_hash).not.toContain(lastCode(email));
    });

    it('a wrong code is rejected', async () => {
      const wrong = lastCode(email) === '000000' ? '111111' : '000000';
      expect(await call('POST', '/v1/auth/password/signup/verify', { email, code: wrong })).toMatchObject({ status: 400, body: { error: 'invalid_code' } });
    });

    it('the right code for a new email gives a pending sign-up, not an account', async () => {
      const r = await call('POST', '/v1/auth/password/signup/verify', { email, code: lastCode(email) });
      expect(r).toMatchObject({ status: 200, body: { is_new: true } });
      expect(r.headers?.['set-cookie']).toMatch(/^sp_session=.+; HttpOnly; Secure; SameSite=Lax/);
      pending = (r.body as any).session;
      expect((await call('GET', '/v1/me', null, pending)).status).toBe(401);
      expect((await call('POST', '/v1/auth/password/signup/verify', { email, code: lastCode(email) })).status).toBe(400); // single use
    });

    it('sign-up completion validates age, consent and username', async () => {
      const base = { username: 'first_trader', age_confirmed: true, terms_accepted: true, privacy_consent: true };
      expect((await call('POST', '/v1/auth/signup/complete', { ...base, age_confirmed: false }, pending)).body).toMatchObject({ param: 'age_confirmed' });
      expect((await call('POST', '/v1/auth/signup/complete', { ...base, privacy_consent: undefined }, pending)).body).toMatchObject({ param: 'privacy_consent' });
      expect((await call('POST', '/v1/auth/signup/complete', { ...base, username: 'SEBI' }, pending)).status).toBe(422);
      expect((await call('POST', '/v1/auth/signup/complete', { ...base, username: 'asterion' }, pending)).status).toBe(422);
      expect((await call('POST', '/v1/auth/signup/complete', { ...base, username: 'no' }, pending)).body).toMatchObject({ param: 'username' });
    });

    it('completes sign-up and returns a real session; me shows the free tier', async () => {
      const r = await call('POST', '/v1/auth/signup/complete', { username: 'first_trader', age_confirmed: true, terms_accepted: true, privacy_consent: true }, pending);
      expect(r.status).toBe(201);
      const me = await call('GET', '/v1/me', null, (r.body as any).session);
      expect(me.body).toMatchObject({ username: 'first_trader', email, tier: 'free', email_verified: true, entitlements: { watchlist_limit: 20, history_days: 30 } });
      expect((await call('POST', '/v1/auth/signup/complete', { username: 'other', age_confirmed: true, terms_accepted: true, privacy_consent: true }, pending)).status).toBe(401);
    });

    it('an existing user signing in again gets is_new false', async () => {
      expect((await call('POST', '/v1/auth/password/sign-in', { email, password: PASSWORD })).body).toMatchObject({ is_new: false });
    });

    it('an alias of an existing address signs in to the same account, not a new one (D-053)', async () => {
      const [local, domain] = email.split('@');
      const alias = `${local}+second@${domain}`;
      const r = await call('POST', '/v1/auth/password/sign-in', { email: alias, password: PASSWORD });
      expect(r.body).toMatchObject({ is_new: false });
      const me = await call('GET', '/v1/me', null, (r.body as any).session);
      expect((me.body as any).username).toBe('first_trader');
    });

    it('a taken username is refused (409)', async () => {
      await call('POST', '/v1/auth/password/signup/start', signupBody('second@example.invalid'));
      const v = await call('POST', '/v1/auth/password/signup/verify', { email: 'second@example.invalid', code: lastCode('second@example.invalid') });
      const r = await call('POST', '/v1/auth/signup/complete', { username: 'FIRST_TRADER', age_confirmed: true, terms_accepted: true, privacy_consent: true }, (v.body as any).session);
      expect(r).toMatchObject({ status: 409, body: { error: 'username_taken' } });
    });
  });

  it('five wrong codes lock the code (423)', async () => {
    const email = 'locked@example.invalid';
    await call('POST', '/v1/auth/password/signup/start', signupBody(email));
    const right = lastCode(email)!;
    const wrong = right === '999999' ? '888888' : '999999';
    for (let i = 0; i < 4; i++) expect((await call('POST', '/v1/auth/password/signup/verify', { email, code: wrong })).status).toBe(400);
    expect((await call('POST', '/v1/auth/password/signup/verify', { email, code: wrong })).status).toBe(423);
    expect((await call('POST', '/v1/auth/password/signup/verify', { email, code: right })).status).toBe(423);
  });

  it('more than five codes an hour are accepted but not sent', async () => {
    const email = 'flood@example.invalid';
    for (let i = 0; i < 7; i++) expect((await call('POST', '/v1/auth/password/signup/start', signupBody(email))).status).toBe(204);
    expect(mailer.sent.filter((m) => m.to === email)).toHaveLength(5);
  }, 20_000);

  it('resending invalidates old signup codes; consuming the newest never revives an older code', async () => {
    const email = 'resend@example.invalid';
    await call('POST', '/v1/auth/password/signup/start', signupBody(email)); const first = lastCode(email);
    await call('POST', '/v1/auth/password/signup/start', signupBody(email)); const latest = lastCode(email);
    expect((await db.query('SELECT used_at FROM auth_challenge WHERE email=$1 ORDER BY id', [email])).rows[0].used_at).not.toBeNull();
    expect((await call('POST', '/v1/auth/password/signup/verify', { email, code: latest })).status).toBe(200);
    expect((await call('POST', '/v1/auth/password/signup/verify', { email, code: first })).status).toBe(400);
  });

  describe('Google sign-in', () => {
    it('a new Google identity gets a pending sign-up, then an account', async () => {
      const r = await call('POST', '/v1/auth/google', { id_token: googleToken('g-sub-1', 'gnew@example.invalid') });
      expect(r.body).toMatchObject({ is_new: true });
      const done = await call('POST', '/v1/auth/signup/complete', { username: 'google_user', age_confirmed: true, terms_accepted: true, privacy_consent: true }, (r.body as any).session);
      expect(done.status).toBe(201);
      expect((await call('POST', '/v1/auth/google', { id_token: googleToken('g-sub-1', 'gnew@example.invalid') })).body).toMatchObject({ is_new: false });
    });

    it('Google with the email of an existing account links to it (one account)', async () => {
      const r = await call('POST', '/v1/auth/google', { id_token: googleToken('g-sub-2', 'first@example.invalid') });
      expect(r.body).toMatchObject({ is_new: false });
      expect((await call('GET', '/v1/me', null, (r.body as any).session)).body).toMatchObject({ username: 'first_trader' });
    });

    it('an invalid token is refused', async () => {
      expect((await call('POST', '/v1/auth/google', { id_token: 'a.b.c' })).status).toBe(401);
    });
  });

  it('sign out, and sign out everywhere', async () => {
    const s1 = await signUp('multi@example.invalid', 'multi_device');
    const s2 = (await call('POST', '/v1/auth/password/sign-in', { email: 'multi@example.invalid', password: PASSWORD })).body as any;
    expect((await call('POST', '/v1/auth/signout', {}, s1)).status).toBe(204);
    expect((await call('GET', '/v1/me', null, s1)).status).toBe(401);
    expect((await call('GET', '/v1/me', null, s2.session)).status).toBe(200);
    const s3 = (await call('POST', '/v1/auth/password/sign-in', { email: 'multi@example.invalid', password: PASSWORD })).body as any;
    await call('POST', '/v1/auth/signout', { everywhere: true }, s3.session);
    expect((await call('GET', '/v1/me', null, s2.session)).status).toBe(401);
  });

  it('a trial unlocks paid features once (PRD-007 US-007.7)', async () => {
    const s = await signUp('trial@example.invalid', 'trial_user');
    expect((await call('GET', '/v1/stream?event_types=results,pledge', null, s)).status).toBe(402);
    expect((await call('POST', '/v1/billing/trial', {}, s)).status).toBe(200);
    expect((await call('GET', '/v1/me', null, s)).body).toMatchObject({ tier: 'paid', trial: { used: true }, entitlements: { watchlist_limit: 200, history_days: null } });
    expect((await call('GET', '/v1/stream?event_types=results,pledge', null, s)).status).toBe(200);
    expect((await call('POST', '/v1/billing/trial', {}, s)).body).toEqual({ error: 'trial_used' });
  });

  it('username change: once per 30 days; the old name is held for others', async () => {
    const s = await signUp('rename@example.invalid', 'old_name');
    expect((await call('PATCH', '/v1/me', { username: 'new_name' }, s)).body).toMatchObject({ username: 'new_name' });
    expect((await call('PATCH', '/v1/me', { username: 'newer_name' }, s))).toMatchObject({ status: 429, body: { error: 'username_change_too_soon' } });
    const other = await signUp('taker@example.invalid', 'taker');
    expect((await call('PATCH', '/v1/me', { username: 'old_name' }, other)).status).toBe(422);
  });

  it('data export contains the user’s own data', async () => {
    const s = await signUp('export@example.invalid', 'exporter');
    const req = await call('POST', '/v1/me/export', {}, s);
    expect(req.status).toBe(202);
    const id = (req.body as any).export_id;
    expect((await call('GET', `/v1/me/export/${id}`, null, s)).body).toEqual({ status: 'pending' });
    await runAccountJobs();
    const ready = (await call('GET', `/v1/me/export/${id}`, null, s)).body as any;
    expect(ready.status).toBe('ready');
    expect(ready.data.account).toMatchObject({ username: 'exporter', email: 'export@example.invalid' });
    const stranger = await signUp('stranger@example.invalid', 'stranger');
    expect((await call('GET', `/v1/me/export/${id}`, null, stranger)).status).toBe(404);
  });

  it('account deletion: sessions end at once; personal data erased by the job; votes stay counted', async () => {
    const s = await signUp('leaver@example.invalid', 'leaver');
    const userId = (await db.query(`SELECT id FROM app_user WHERE username = 'leaver'`)).rows[0].id;
    await db.query(`INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_x', 'X', 'article', 3, '{}') ON CONFLICT DO NOTHING`);
    const item = await db.query(`INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url) VALUES ($1, 'article', 'src_x', 'k', 'Invented headline', 'https://example.invalid/k') RETURNING id`, [newPublicId('it')]);
    await db.query('BEGIN');
    const story = await db.query(`INSERT INTO story (public_id, first_seen_at, primary_item_id) VALUES ($1, now(), $2) RETURNING id`, [newPublicId('st'), item.rows[0].id]);
    await db.query(`INSERT INTO story_item (item_id, story_id) VALUES ($1, $2)`, [item.rows[0].id, story.rows[0].id]);
    await db.query(`INSERT INTO story_event_type (story_id, code, source) VALUES ($1, 'other', 'rule')`, [story.rows[0].id]);
    await db.query('COMMIT');
    await db.query(`INSERT INTO vote_directional (story_id, user_id, direction) VALUES ($1, $2, 'bullish')`, [story.rows[0].id, userId]);
    await db.query(`INSERT INTO comment (public_id, story_id, user_id, body) VALUES ($1, $2, $3, 'My comment')`, [newPublicId('cm'), story.rows[0].id, userId]);

    const del = await call('POST', '/v1/me/delete', { comments: 'delete' }, s);
    expect(del.status).toBe(202);
    expect((await call('GET', '/v1/me', null, s)).status).toBe(401);
    await runAccountJobs();

    const u = (await db.query('SELECT email, username, google_sub, deleted_at FROM app_user WHERE id = $1', [userId])).rows[0];
    expect(u).toMatchObject({ email: null, username: null, google_sub: null });
    expect(u.deleted_at).not.toBeNull();
    expect((await db.query('SELECT bullish FROM story_vote_count WHERE story_id = $1', [story.rows[0].id])).rows[0].bullish).toBe(1);
    expect((await db.query('SELECT state, body FROM comment WHERE user_id = $1', [userId])).rows[0]).toEqual({ state: 'deleted_by_author', body: null });
    const other = await signUp('reuse@example.invalid', 'reuser');
    expect((await call('PATCH', '/v1/me', { username: 'leaver' }, other)).status).toBe(422); // held 90 days
    const audit = await db.query(`SELECT action FROM audit_log WHERE action LIKE 'account.%' ORDER BY id`);
    expect(audit.rows.map((r) => r.action)).toEqual(['account.deletion_requested', 'account.deleted']);
  });

  it('GET /v1/plans lists GST-inclusive prices and the trial', async () => {
    expect((await call('GET', '/v1/plans')).body).toEqual({
      plans: [
        { id: 'monthly', price_inr: 299, gst_inclusive: true },
        { id: 'yearly', price_inr: 2999, gst_inclusive: true },
      ],
      trial_days: 14,
    });
  });

  it('the HTTP server rejects non-JSON writes and accepts the session cookie', async () => {
    const url = new URL(adminUrl!);
    url.pathname = `/${dbName}`;
    const pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    const server = createApiServer(pool, deps);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const form = await fetch(`${base}/v1/auth/password/signup/start`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=x@example.invalid' });
      expect(form.status).toBe(415);
      await fetch(`${base}/v1/auth/password/signup/start`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(signupBody('http@example.invalid')) });
      const verify = await fetch(`${base}/v1/auth/password/signup/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'http@example.invalid', code: lastCode('http@example.invalid') }),
      });
      const cookie = verify.headers.get('set-cookie')!.split(';')[0]!;
      const done = await fetch(`${base}/v1/auth/signup/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ username: 'http_user', age_confirmed: true, terms_accepted: true, privacy_consent: true }),
      });
      expect(done.status).toBe(201);
      const sessionCookie = done.headers.get('set-cookie')!.split(';')[0]!;
      const me = await fetch(`${base}/v1/me`, { headers: { cookie: sessionCookie } });
      expect(me.status).toBe(200);
      expect(((await me.json()) as any).username).toBe('http_user');
    } finally {
      await new Promise((r) => server.close(r));
      await pool.end();
    }
  });
});
