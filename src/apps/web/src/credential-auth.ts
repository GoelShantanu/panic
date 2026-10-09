import type pg from 'pg';
import { DUMMY_PASSWORD_HASH, hashChallenge, hashPassword, hashToken, isValidPassword, normaliseEmail, verifyPassword } from '@stockpanic/core';
import { consumeAuthChallenge, findCredentials, linkGoogleSub, setUserPassword } from '@stockpanic/db';
import type { ChallengePurpose } from '@stockpanic/db';
import { CLEAR_SESSION_COOKIE, issuePending, issueSession, requestAuthChallenge } from './auth.ts';
import type { AuthDeps, AuthResponse } from './auth.ts';
import { passwordAttemptsPerAccount } from './ratelimit.ts';

const field = (body: unknown, key: string): unknown => typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;
const emailOf = (body: unknown) => typeof field(body, 'email') === 'string' ? normaliseEmail(field(body, 'email') as string) : null;
const invalid = (param: string): AuthResponse => ({ status: 400, body: { error: 'invalid_param', param } });
const nameOf = (body: unknown, key: string) => {
  const value = field(body, key);
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 80 && !/[\p{C}]/u.test(value) ? value.trim() : null;
};
const invalidCredentials: AuthResponse = { status: 401, body: { error: 'invalid_credentials' } };

export async function postPasswordSignIn(db: pg.ClientBase, body: unknown, now: Date): Promise<AuthResponse> {
  const email = emailOf(body), password = field(body, 'password');
  if (!email || !isValidPassword(password)) return invalidCredentials;
  const canonical = (await db.query('SELECT email_canonical($1) AS email', [email])).rows[0].email;
  if (!passwordAttemptsPerAccount.allow(hashToken(canonical), now.getTime())) return { status: 429, body: { error: 'too_many_attempts' } };
  const user = await findCredentials(db, email);
  const verified = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!verified || !user?.passwordHash || !user.emailVerified) return invalidCredentials;
  await db.query('BEGIN');
  try {
    const current = await findCredentials(db, email, true);
    if (!current || current.id !== user.id || current.authVersion !== user.authVersion || current.passwordHash !== user.passwordHash) {
      await db.query('ROLLBACK'); return invalidCredentials;
    }
    const response = await issueSession(db, user.id, now, false);
    await db.query('COMMIT'); return response;
  } catch (err) { await db.query('ROLLBACK'); throw err; }
}

export async function postPasswordSignupStart(db: pg.ClientBase, body: unknown, deps: AuthDeps, now: Date, ip: string | null): Promise<AuthResponse> {
  const email = emailOf(body), firstName = nameOf(body, 'first_name'), lastName = nameOf(body, 'last_name'), password = field(body, 'password');
  if (!email) return invalid('email');
  if (!firstName) return invalid('first_name');
  if (!lastName) return invalid('last_name');
  if (!isValidPassword(password)) return invalid('password');
  // Same response and hashing cost for an existing address; signup never overwrites its credentials.
  const passwordHash = await hashPassword(password);
  if (!await findCredentials(db, email)) await requestAuthChallenge(db, email, 'signup', { firstName, lastName, passwordHash }, deps, now, ip);
  return { status: 204, body: null };
}

export async function postPasswordResetStart(db: pg.ClientBase, body: unknown, deps: AuthDeps, now: Date, ip: string | null): Promise<AuthResponse> {
  const email = emailOf(body);
  if (!email) return invalid('email');
  const user = await findCredentials(db, email);
  if (user) await requestAuthChallenge(db, email, 'reset', { userId: user.id }, deps, now, ip);
  return { status: 204, body: null };
}

export async function postChallengeVerify(db: pg.ClientBase, body: unknown, purpose: ChallengePurpose, deps: AuthDeps, now: Date): Promise<AuthResponse> {
  const email = emailOf(body), code = field(body, 'code');
  if (!email) return invalid('email');
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalid('code');
  const password = field(body, 'password');
  if (purpose === 'reset' && !isValidPassword(password)) return invalid('password');
  await db.query('BEGIN');
  try {
    const user = await findCredentials(db, email, true);
    const checked = await consumeAuthChallenge(db, email, purpose, hashChallenge(deps.authSecret, email, code, purpose), now);
    if (checked.status !== 'ok') {
      await db.query('COMMIT'); // Failed attempts must persist.
      return { status: checked.status === 'locked' ? 423 : 400, body: { error: checked.status === 'locked' ? 'code_locked' : 'invalid_code' } };
    }
    const data = checked.data;
    let response: AuthResponse;
    if (purpose === 'reset') {
      if (!user || user.id !== data.userId || !await setUserPassword(db, user.id, await hashPassword(password as string), now)) {
        await db.query('ROLLBACK'); return { status: 400, body: { error: 'invalid_code' } };
      }
      response = { status: 204, body: null, headers: { 'set-cookie': CLEAR_SESSION_COOKIE } };
    } else if (purpose === 'signup') {
      if (user) response = { status: 409, body: { error: 'account_exists' } };
      else response = await issuePending(db, { email, googleSub: null, firstName: data.firstName ?? null, lastName: data.lastName ?? null, passwordHash: data.passwordHash ?? null }, now);
    } else {
      if (data.userId && user?.id !== data.userId) response = { status: 400, body: { error: 'invalid_code' } };
      else if (user) response = await linkGoogleSub(db, user.id, data.googleSub!) ? await issueSession(db, user.id, now, false) : { status: 409, body: { error: 'google_already_linked' } };
      else response = await issuePending(db, { email, googleSub: data.googleSub!, firstName: data.firstName ?? null, lastName: data.lastName ?? null }, now);
    }
    await db.query('COMMIT'); return response;
  } catch (err) {
    await db.query('ROLLBACK');
    if ((err as { code?: string }).code === '23505') return { status: 409, body: { error: 'account_exists' } };
    throw err;
  }
}
