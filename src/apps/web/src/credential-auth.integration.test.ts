import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, processDeletion, processExport, createExportRequest, createPendingSignup, createUser, createEmailCode } from '@stockpanic/db';
import { hashOtp } from '@stockpanic/core';
import { MemoryMailer } from '@stockpanic/mail';
import { route } from './api.ts';
import { createGoogleVerifier } from './google.ts';

const adminUrl = process.env['TEST_DATABASE_URL'];
const PASSWORD = 'A unique testing passphrase!';
const REPLACEMENT = 'A different testing passphrase!';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const clientId = 'credential-test.apps.googleusercontent.com';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function googleToken(email: string, sub: string, hosted = false) {
  const h = b64({ alg: 'RS256', kid: 'test' });
  const p = b64({ iss: 'https://accounts.google.com', aud: clientId, exp: Date.now() / 1000 + 3600, sub, email, email_verified: true, given_name: 'Ada', family_name: 'Lovelace', ...(hosted ? { hd: 'example.invalid' } : {}) });
  return `${h}.${p}.${sign('RSA-SHA256', Buffer.from(`${h}.${p}`), keys.privateKey).toString('base64url')}`;
}

describe.skipIf(!adminUrl)('passwords and identity verification against PostgreSQL', () => {
  const dbName = `sp_credentials_${randomBytes(4).toString('hex')}`;
  let admin: pg.Client, db: pg.Client, dbUrl: string;
  const mailer = new MemoryMailer();
  const deps = { mailer, authSecret: 'test-secret-not-a-production-credential', google: createGoogleVerifier(clientId, async () => [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'test' }]) };
  const call = (path: string, body: unknown = null, token: string | null = null, now = new Date(), client = db, ip: string | null = null) => route(client, path === '/v1/me' ? 'GET' : 'POST', new URL(`http://test${path}`), now, { body, sessionToken: token, ...(ip ? { ip } : {}) }, deps);
  const code = (email: string) => [...mailer.sent].reverse().find(m => m.to === email)!.text.match(/\b\d{6}\b/)![0];
  const complete = async (pending: any, username: string) => call('/v1/auth/signup/complete', { username, age_confirmed: true, terms_accepted: true, privacy_consent: true }, pending.session);
  const signup = async (email: string, username: string) => {
    await call('/v1/auth/password/signup/start', { email, password: PASSWORD, first_name: 'Ada', last_name: 'Lovelace' });
    const verified = await call('/v1/auth/password/signup/verify', { email, code: code(email) });
    const done = await complete(verified.body, username);
    expect(done.status).toBe(201);
    return (done.body as any).session as string;
  };
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl }); await admin.connect(); await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(adminUrl!); url.pathname = `/${dbName}`; dbUrl = url.toString();
    db = new pg.Client({ connectionString: dbUrl }); await db.connect(); await migrate(db);
  });
  afterAll(async () => { await db?.end(); await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin?.end(); });

  it('requires verification before activation; persists names and only a salted hash', async () => {
    const email = 'signup@example.invalid';
    expect((await call('/v1/auth/password/signup/start', { email, password: PASSWORD, first_name: 'Ada', last_name: 'Lovelace' })).status).toBe(204);
    const challenge = (await db.query('SELECT * FROM auth_challenge WHERE email=$1', [email])).rows[0];
    expect(challenge.password_hash).toMatch(/^scrypt\$/); expect(challenge.password_hash).not.toContain(PASSWORD);
    expect(challenge.code_hash).not.toBe(code(email));
    expect((await db.query('SELECT 1 FROM app_user WHERE email=$1', [email])).rowCount).toBe(0);
    expect((await call('/v1/auth/password/sign-in', { email, password: PASSWORD })).status).toBe(401);
    expect((await call('/v1/auth/email/verify', { email, code: code(email) })).status).toBe(404);
    const verified = await call('/v1/auth/password/signup/verify', { email, code: code(email) });
    expect((await call('/v1/me', null, (verified.body as any).session)).status).toBe(401);
    expect((await call('/v1/auth/password/signup/verify', { email, code: code(email) })).status).toBe(400);
    const done = await complete(verified.body, 'password_user');
    expect((await call('/v1/me', null, (done.body as any).session)).body).toMatchObject({ first_name: 'Ada', last_name: 'Lovelace', email_verified: true, sign_in_methods: ['password'] });
    expect((await call('/v1/auth/password/sign-in', { email, password: PASSWORD })).body).toMatchObject({ is_new: false });
  });

  it('uses generic failures for wrong, missing-account and passwordless credentials', async () => {
    const wrong = await call('/v1/auth/password/sign-in', { email: 'signup@example.invalid', password: REPLACEMENT });
    const unknown = await call('/v1/auth/password/sign-in', { email: 'unknown@example.invalid', password: PASSWORD });
    expect(wrong).toEqual(unknown); expect(wrong.status).toBe(401); expect(wrong.headers).toBeUndefined();
  });

  it('validates profile and password inputs without creating challenges', async () => {
    const base = { email: 'invalid@example.invalid', password: PASSWORD, first_name: 'Ada', last_name: 'Lovelace' };
    expect((await call('/v1/auth/password/signup/start', { ...base, password: 'short' })).body).toMatchObject({ param: 'password' });
    expect((await call('/v1/auth/password/signup/start', { ...base, first_name: '\n' })).body).toMatchObject({ param: 'first_name' });
    expect((await call('/v1/auth/password/signup/start', { ...base, last_name: 'x'.repeat(81) })).body).toMatchObject({ param: 'last_name' });
    expect((await db.query('SELECT 1 FROM auth_challenge WHERE email=$1', [base.email])).rowCount).toBe(0);
  });

  it('never overwrites an existing account during signup', async () => {
    const before = (await db.query("SELECT password_hash FROM app_user WHERE email='signup@example.invalid'")).rows[0];
    const sent = mailer.sent.length;
    expect((await call('/v1/auth/password/signup/start', { email: 'signup@example.invalid', password: REPLACEMENT, first_name: 'Other', last_name: 'Person' })).status).toBe(204);
    expect(mailer.sent.length).toBe(sent);
    expect((await db.query("SELECT password_hash FROM app_user WHERE email='signup@example.invalid'")).rows[0]).toEqual(before);
  });

  it('reset codes are purpose-bound; reset revokes sessions and does not sign in', async () => {
    const email = 'reset@example.invalid', session = await signup(email, 'reset_user');
    const oldLoginCode = '123456';
    await createEmailCode(db, email, hashOtp(deps.authSecret, email, oldLoginCode), new Date(), new Date(Date.now() + 600_000));
    await call('/v1/auth/password/reset/start', { email }); const resetCode = code(email);
    expect(mailer.sent.at(-1)?.text).toContain('cannot sign you in');
    expect((await call('/v1/auth/password/signup/verify', { email, code: resetCode })).status).toBe(400);
    const reset = await call('/v1/auth/password/reset/complete', { email, code: resetCode, password: REPLACEMENT });
    expect(reset).toMatchObject({ status: 204, body: null }); expect(reset.headers?.['set-cookie']).toContain('Max-Age=0');
    expect((await call('/v1/me', null, session)).status).toBe(401);
    expect((await call('/v1/auth/email/verify', { email, code: oldLoginCode })).status).toBe(404);
    expect((await db.query('SELECT used_at FROM email_code WHERE email=$1', [email])).rows[0].used_at).not.toBeNull();
    expect((await call('/v1/auth/email/verify', { email, code: resetCode })).status).toBe(404);
    expect((await call('/v1/auth/password/sign-in', { email, password: PASSWORD })).status).toBe(401);
    expect((await call('/v1/auth/password/sign-in', { email, password: REPLACEMENT })).status).toBe(200);
    expect((await call('/v1/auth/password/reset/complete', { email, code: resetCode, password: PASSWORD })).status).toBe(400);
  });

  it('lets an existing code-only user set a first password while preserving their account', async () => {
    const email = 'legacy@example.invalid';
    // Fixture represents a persisted account created before password login was introduced.
    const before = await createUser(db, { email, username: 'legacy_user', googleSub: null, marketingOptIn: false, now: new Date() });
    if (!before.ok) throw new Error(before.error);
    expect((await call('/v1/auth/password/sign-in', { email, password: PASSWORD })).status).toBe(401);
    await call('/v1/auth/password/reset/start', { email });
    expect((await call('/v1/auth/password/reset/complete', { email, code: code(email), password: PASSWORD })).status).toBe(204);
    const login = await call('/v1/auth/password/sign-in', { email: 'legacy+alias@example.invalid', password: PASSWORD });
    const after = (await call('/v1/me', null, (login.body as any).session)).body as any;
    expect(after.user_id).toBe(before.user.publicId); expect(after.username).toBe(before.user.username);
  });

  it('does not reveal unknown accounts or mail a reset code to them', async () => {
    const sent = mailer.sent.length;
    expect((await call('/v1/auth/password/reset/start', { email: 'absent@example.invalid' })).status).toBe(204);
    expect(mailer.sent.length).toBe(sent);
  });

  it('locks after five wrong recovery attempts, including after a valid code is later supplied', async () => {
    const email = 'lock@example.invalid'; await signup(email, 'lock_user'); await call('/v1/auth/password/reset/start', { email });
    const right = code(email), wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) expect((await call('/v1/auth/password/reset/complete', { email, code: wrong, password: PASSWORD })).status).toBe(400);
    expect((await call('/v1/auth/password/reset/complete', { email, code: wrong, password: PASSWORD })).status).toBe(423);
    expect((await call('/v1/auth/password/reset/complete', { email, code: right, password: PASSWORD })).status).toBe(423);
  });

  it('expires recovery codes and invalidates superseded codes without reviving older ones', async () => {
    const email = 'expiry@example.invalid'; await signup(email, 'expiry_user');
    await call('/v1/auth/password/reset/start', { email }); const first = code(email);
    await call('/v1/auth/password/reset/start', { email }); const latest = code(email);
    expect((await db.query("SELECT used_at FROM auth_challenge WHERE email=$1 AND purpose='reset' ORDER BY id", [email])).rows[0].used_at).not.toBeNull();
    if (first !== latest) expect((await call('/v1/auth/password/reset/complete', { email, code: first, password: PASSWORD })).status).toBe(400);
    expect((await call('/v1/auth/password/reset/complete', { email, code: latest, password: PASSWORD }, null, new Date(Date.now() + 11 * 60_000))).status).toBe(400);
  });

  it('allows only one simultaneous completion of a recovery code', async () => {
    const email = 'race@example.invalid'; await signup(email, 'race_user'); await call('/v1/auth/password/reset/start', { email });
    const other = new pg.Client({ connectionString: dbUrl }); await other.connect();
    try {
      const body = { email, code: code(email), password: REPLACEMENT };
      const results = await Promise.all([call('/v1/auth/password/reset/complete', body), call('/v1/auth/password/reset/complete', body, null, new Date(), other)]);
      expect(results.map(r => r.status).sort()).toEqual([204, 400]);
    } finally { await other.end(); }
  });

  it('Google signup retains names; authoritative email links an existing password account', async () => {
    const email = 'google@gmail.com';
    const pending = await call('/v1/auth/google', { id_token: googleToken(email, 'google-new') });
    expect(pending.status).toBe(200);
    const done = await complete(pending.body, 'google_named');
    expect((await call('/v1/me', null, (done.body as any).session)).body).toMatchObject({ first_name: 'Ada', last_name: 'Lovelace', sign_in_methods: ['google'] });
    expect((await call('/v1/auth/google', { id_token: googleToken(email, 'google-new') })).body).toMatchObject({ is_new: false });
    const existing = 'linked@example.invalid', session = await signup(existing, 'linked_password');
    const old = (await call('/v1/me', null, session)).body as any;
    const login = await call('/v1/auth/google', { id_token: googleToken(existing, 'google-existing', true) });
    expect((await call('/v1/me', null, (login.body as any).session)).body).toMatchObject({ user_id: old.user_id, sign_in_methods: ['password', 'google'] });
    expect((await call('/v1/auth/password/sign-in', { email: existing, password: PASSWORD })).status).toBe(200);
    expect((await call('/v1/auth/google', { id_token: googleToken(existing, 'different-google', true) })).status).toBe(409);
  });

  it('requires current mailbox verification for third-party Google email before linking', async () => {
    const email = 'thirdparty@example.invalid', session = await signup(email, 'thirdparty_user');
    const pending = await call('/v1/auth/google', { id_token: googleToken(email, 'thirdparty-google') });
    expect(pending).toMatchObject({ status: 202, body: { requires_email_verification: true, email } }); expect(pending.headers).toBeUndefined();
    const verification = code(email);
    expect((await db.query('SELECT google_sub FROM app_user WHERE email=$1', [email])).rows[0].google_sub).toBeNull();
    expect((await call('/v1/auth/email/verify', { email, code: verification })).status).toBe(404);
    const login = await call('/v1/auth/google/verify', { email, code: verification });
    expect(login.status).toBe(200);
    const original = (await call('/v1/me', null, session)).body as any;
    expect((await call('/v1/me', null, (login.body as any).session)).body).toMatchObject({ user_id: original.user_id });
    expect((await call('/v1/auth/google/verify', { email, code: verification })).status).toBe(400);
  });

  it('deletion erases credentials and profile; export excludes all credential material', async () => {
    const email = 'delete@example.invalid', session = await signup(email, 'delete_password');
    const id = (await db.query('SELECT id FROM app_user WHERE email=$1', [email])).rows[0].id;
    const exportId = await createExportRequest(db, id, new Date()); await processExport(db, exportId, new Date());
    const exported = (await db.query('SELECT data FROM data_export WHERE id=$1', [exportId])).rows[0].data;
    expect(exported.account.first_name).toBe('Ada'); expect(JSON.stringify(exported)).not.toMatch(/password_hash|auth_version|scrypt\$/);
    await call('/v1/auth/password/reset/start', { email });
    const alias = 'delete+old@example.invalid';
    await createEmailCode(db, alias, hashOtp(deps.authSecret, alias, '123456'), new Date(), new Date(Date.now() + 600_000));
    await createPendingSignup(db, 'expired-alias-signup', { email: alias, googleSub: null, passwordHash: (await db.query('SELECT password_hash FROM app_user WHERE id=$1', [id])).rows[0].password_hash }, new Date(Date.now() + 600_000));
    await call('/v1/me/delete', {}, session);
    await db.query('BEGIN'); await processDeletion(db, id, new Date()); await db.query('COMMIT');
    expect((await db.query('SELECT password_hash, first_name, last_name FROM app_user WHERE id=$1', [id])).rows[0]).toEqual({ password_hash: null, first_name: null, last_name: null });
    expect((await db.query('SELECT 1 FROM auth_challenge WHERE email=$1', [email])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM email_code WHERE email=$1', [alias])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM pending_signup WHERE email=$1', [alias])).rowCount).toBe(0);
  });

  it('bounds password attempts per canonical account and unauthenticated client', async () => {
    const email = 'brute@example.invalid';
    for (let i = 0; i < 10; i++) expect((await call('/v1/auth/password/sign-in', { email, password: PASSWORD })).status).toBe(401);
    expect((await call('/v1/auth/password/sign-in', { email: 'brute+alias@example.invalid', password: PASSWORD })).status).toBe(429);
    for (let i = 0; i < 30; i++) expect((await call('/v1/auth/password/reset/start', { email }, null, new Date(), db, '192.0.2.19')).status).toBe(204);
    expect((await call('/v1/auth/password/reset/start', { email }, null, new Date(), db, '192.0.2.19')).status).toBe(429);
  }, 20_000);
});
