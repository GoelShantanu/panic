// Account endpoints (PRD-007 §4.1, §4.2, §4.4; trial from §4.3).

import type { BillingDeps } from './billing.ts';
import type pg from 'pg';
import {
  OTP_MAX_PER_HOUR,
  OTP_TTL_MS,
  PENDING_SIGNUP_TTL_MS,
  PLANS,
  SESSION_COOKIE,
  SESSION_IDLE_DAYS,
  TRIAL_DAYS,
  entitlementsPayload,
  hashOtp,
  hashToken,
  isValidUsername,
  newOtp,
  newToken,
  normaliseEmail,
} from '@stockpanic/core';
import {
  changeUsername,
  checkEmailCode,
  createEmailCode,
  createExportRequest,
  createPendingSignup,
  createSession,
  createUser,
  findUserByEmail,
  findUserByGoogleSub,
  getExport,
  linkGoogleSub,
  loadMe,
  recentCodeCount,
  requestDeletion,
  revokeAllSessions,
  revokeSession,
  sessionUser,
  startTrial,
  takePendingSignup,
} from '@stockpanic/db';
import type { SessionUser } from '@stockpanic/db';
import { signInCodeEmail } from '@stockpanic/mail';
import type { Mailer } from '@stockpanic/mail';
import type { GoogleVerifier } from './google.ts';

export interface AuthDeps {
  mailer: Mailer;
  authSecret: string;
  google: GoogleVerifier | null;
  billing?: BillingDeps | null;
}

export interface AuthResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const invalid = (param: string): AuthResponse => ({ status: 400, body: { error: 'invalid_param', param } });
const authRequired: AuthResponse = { status: 401, body: { error: 'auth_required' } };

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_IDLE_DAYS * 86_400}`;
}
export const CLEAR_SESSION_COOKIE = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined;

export async function viewerFromToken(db: pg.ClientBase, token: string | null, now: Date): Promise<SessionUser | null> {
  return token ? sessionUser(db, hashToken(token), now) : null;
}

async function issueSession(db: pg.ClientBase, userId: string, now: Date, isNew: boolean): Promise<AuthResponse> {
  const token = newToken();
  await createSession(db, hashToken(token), userId, now);
  return { status: 200, body: { session: token, is_new: isNew }, headers: { 'set-cookie': sessionCookie(token) } };
}

async function issuePending(db: pg.ClientBase, identity: { email: string | null; googleSub: string | null }, now: Date): Promise<AuthResponse> {
  const token = newToken();
  await createPendingSignup(db, hashToken(token), identity, new Date(now.getTime() + PENDING_SIGNUP_TTL_MS));
  return { status: 200, body: { session: token, is_new: true }, headers: { 'set-cookie': sessionCookie(token) } };
}

// POST /v1/auth/email/start — always 204, never reveals whether an account exists.
export async function postEmailStart(db: pg.ClientBase, body: unknown, deps: AuthDeps, now: Date): Promise<AuthResponse> {
  const raw = field(body, 'email');
  const email = typeof raw === 'string' ? normaliseEmail(raw) : null;
  if (!email) return invalid('email');
  if ((await recentCodeCount(db, email, new Date(now.getTime() - 3600_000))) >= OTP_MAX_PER_HOUR) return { status: 204, body: null };
  const code = newOtp();
  await createEmailCode(db, email, hashOtp(deps.authSecret, email, code), now, new Date(now.getTime() + OTP_TTL_MS));
  await deps.mailer.send({ to: email, ...signInCodeEmail(code) });
  return { status: 204, body: null };
}

// POST /v1/auth/email/verify
export async function postEmailVerify(db: pg.ClientBase, body: unknown, deps: AuthDeps, now: Date): Promise<AuthResponse> {
  const rawEmail = field(body, 'email');
  const code = field(body, 'code');
  const email = typeof rawEmail === 'string' ? normaliseEmail(rawEmail) : null;
  if (!email) return invalid('email');
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return invalid('code');
  const check = await checkEmailCode(db, email, hashOtp(deps.authSecret, email, code), now);
  if (check === 'locked') return { status: 423, body: { error: 'code_locked' } };
  if (check === 'invalid') return { status: 400, body: { error: 'invalid_code' } };
  const user = await findUserByEmail(db, email);
  return user ? issueSession(db, user.id, now, false) : issuePending(db, { email, googleSub: null }, now);
}

// POST /v1/auth/google
export async function postGoogle(db: pg.ClientBase, body: unknown, deps: AuthDeps, now: Date): Promise<AuthResponse> {
  if (!deps.google) return { status: 503, body: { error: 'google_sign_in_unavailable' } };
  const idToken = field(body, 'id_token');
  if (typeof idToken !== 'string' || idToken.length > 8192) return invalid('id_token');
  const identity = await deps.google.verify(idToken, now);
  if (!identity) return { status: 401, body: { error: 'invalid_google_token' } };
  const bySub = await findUserByGoogleSub(db, identity.sub);
  if (bySub) return issueSession(db, bySub.id, now, false);
  const byEmail = await findUserByEmail(db, identity.email);
  if (byEmail) {
    await linkGoogleSub(db, byEmail.id, identity.sub);
    return issueSession(db, byEmail.id, now, false);
  }
  return issuePending(db, { email: identity.email, googleSub: identity.sub }, now);
}

// POST /v1/auth/signup/complete — the pending token comes from the cookie or bearer header.
export async function postSignupComplete(db: pg.ClientBase, body: unknown, token: string | null, now: Date): Promise<AuthResponse> {
  if (!token) return authRequired;
  const username = field(body, 'username');
  if (typeof username !== 'string' || !isValidUsername(username)) return invalid('username');
  if (field(body, 'age_confirmed') !== true) return invalid('age_confirmed'); // C-007.6
  if (field(body, 'terms_accepted') !== true) return invalid('terms_accepted');
  if (field(body, 'privacy_consent') !== true) return invalid('privacy_consent'); // US-007.4 AC-2
  const marketing = field(body, 'marketing_opt_in');
  if (marketing !== undefined && typeof marketing !== 'boolean') return invalid('marketing_opt_in');

  await db.query('BEGIN');
  const pending = await takePendingSignup(db, hashToken(token), now);
  if (!pending) {
    await db.query('ROLLBACK');
    return authRequired;
  }
  const created = await createUser(db, { username, email: pending.email, googleSub: pending.googleSub, marketingOptIn: marketing === true, now });
  if (!created.ok) {
    await db.query('ROLLBACK'); // the pending sign-up survives for another attempt
    return created.error === 'username_reserved'
      ? { status: 422, body: { error: 'username_reserved' } }
      : { status: 409, body: { error: created.error } };
  }
  const session = newToken();
  await createSession(db, hashToken(session), created.user.id, now);
  await db.query('COMMIT');
  return { status: 201, body: { session, user_id: created.user.publicId, username: created.user.username }, headers: { 'set-cookie': sessionCookie(session) } };
}

// POST /v1/auth/signout
export async function postSignout(db: pg.ClientBase, body: unknown, token: string | null, viewer: SessionUser | null, now: Date): Promise<AuthResponse> {
  if (token) await revokeSession(db, hashToken(token), now);
  if (field(body, 'everywhere') === true && viewer) await revokeAllSessions(db, viewer.id, now);
  return { status: 204, body: null, headers: { 'set-cookie': CLEAR_SESSION_COOKIE } };
}

// GET /v1/me (PRD-007 §4.2)
export async function getMe(db: pg.ClientBase, viewer: SessionUser | null): Promise<AuthResponse> {
  if (!viewer) return authRequired;
  const me = await loadMe(db, viewer.id);
  return {
    status: 200,
    body: {
      user_id: me.public_id,
      username: me.username,
      email: me.email,
      created_at: me.created_at,
      email_verified: me.email_verified,
      tier: me.tier,
      trial: { used: me.trial_ends_at !== null, ends_at: me.trial_ends_at },
      subscription: me.subscription,
      entitlements: entitlementsPayload(me.tier),
    },
  };
}

// PATCH /v1/me — username change (PRD-007 US-007.2 AC-3)
export async function patchMe(db: pg.ClientBase, body: unknown, viewer: SessionUser | null, now: Date): Promise<AuthResponse> {
  if (!viewer) return authRequired;
  const username = field(body, 'username');
  if (typeof username !== 'string' || !isValidUsername(username)) return invalid('username');
  if (username === viewer.username) return getMe(db, viewer);
  const r = await changeUsername(db, viewer.id, username, now);
  if (r.ok) return getMe(db, { ...viewer, username });
  if (r.error === 'too_soon') return { status: 429, body: { error: 'username_change_too_soon', available_from: r.availableFrom } };
  if (r.error === 'username_reserved') return { status: 422, body: { error: 'username_reserved' } };
  return { status: 409, body: { error: r.error } };
}

// POST /v1/billing/trial (PRD-007 US-007.7 AC-2)
export async function postTrial(db: pg.ClientBase, viewer: SessionUser | null, now: Date): Promise<AuthResponse> {
  if (!viewer) return authRequired;
  const r = await startTrial(db, viewer.id, now);
  return r.ok ? { status: 200, body: { trial: { ends_at: r.endsAt } } } : { status: 409, body: { error: 'trial_used' } };
}

// GET /v1/plans (PRD-007 §4.3)
export function getPlans(): AuthResponse {
  return { status: 200, body: { plans: PLANS, trial_days: TRIAL_DAYS } };
}

// POST /v1/me/export, GET /v1/me/export/{id} (PRD-007 §4.4)
export async function postExport(db: pg.ClientBase, viewer: SessionUser | null, now: Date): Promise<AuthResponse> {
  if (!viewer) return authRequired;
  const id = await createExportRequest(db, viewer.id, now);
  return { status: 202, body: { export_id: id, ready_by: new Date(now.getTime() + 72 * 3600_000) } };
}

export async function getExportStatus(db: pg.ClientBase, viewer: SessionUser | null, exportId: string, now: Date): Promise<AuthResponse> {
  if (!viewer) return authRequired;
  const r = await getExport(db, viewer.id, exportId, now);
  return r ? { status: 200, body: r } : { status: 404, body: { error: 'not_found' } };
}

// POST /v1/me/delete (PRD-007 US-007.3 AC-2/AC-3)
export async function postDelete(db: pg.ClientBase, body: unknown, viewer: SessionUser | null, now: Date): Promise<AuthResponse> {
  if (!viewer) return authRequired;
  const choice = field(body, 'comments') ?? 'keep_as_deleted_user';
  if (choice !== 'keep_as_deleted_user' && choice !== 'delete') return invalid('comments');
  const completesBy = await requestDeletion(db, viewer.id, choice, now);
  return { status: 202, body: { completes_by: completesBy }, headers: { 'set-cookie': CLEAR_SESSION_COOKIE } };
}
