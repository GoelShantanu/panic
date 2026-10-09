import type pg from 'pg';
import { OTP_MAX_ATTEMPTS, safeEqualHex } from '@stockpanic/core';
import type { UserRef } from './accounts.ts';

export type ChallengePurpose = 'signup' | 'reset' | 'google';
export interface CredentialUser extends UserRef {
  passwordHash: string | null;
  authVersion: number;
  emailVerified: boolean;
  googleSub: string | null;
}
export async function findCredentials(db: pg.ClientBase, email: string, lock = false): Promise<CredentialUser | null> {
  const { rows } = await db.query(
    `SELECT id, public_id, username, password_hash, auth_version, google_sub, email_verified_at IS NOT NULL AS verified
       FROM app_user WHERE email_canonical(email::text) = email_canonical($1)
        AND deleted_at IS NULL AND deletion_requested_at IS NULL ${lock ? 'FOR UPDATE' : ''}`, [email]);
  const r = rows[0];
  return r ? { id: String(r.id), publicId: r.public_id, username: r.username, passwordHash: r.password_hash, authVersion: r.auth_version, googleSub: r.google_sub, emailVerified: r.verified } : null;
}

export interface ChallengeData {
  userId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  passwordHash?: string | null;
  googleSub?: string | null;
}
export async function createAuthChallenge(db: pg.ClientBase, email: string, purpose: ChallengePurpose, codeHash: string, now: Date, expires: Date, data: ChallengeData): Promise<void> {
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended(email_canonical($1) || $2, 0))', [email, purpose]);
    await db.query('UPDATE auth_challenge SET used_at = $3 WHERE email_canonical(email::text) = email_canonical($1) AND purpose = $2 AND used_at IS NULL', [email, purpose, now]);
    await db.query(`INSERT INTO auth_challenge(email, purpose, code_hash, created_at, expires_at, user_id, first_name, last_name, password_hash, google_sub)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [email, purpose, codeHash, now, expires, data.userId ?? null, data.firstName ?? null, data.lastName ?? null, data.passwordHash ?? null, data.googleSub ?? null]);
    await db.query('COMMIT');
  } catch (err) { await db.query('ROLLBACK'); throw err; }
}

// Caller owns the transaction so consuming a code and changing credentials are atomic.
export async function consumeAuthChallenge(db: pg.ClientBase, email: string, purpose: ChallengePurpose, codeHash: string, now: Date): Promise<{ status: 'invalid' | 'locked' } | { status: 'ok'; data: ChallengeData }> {
  const { rows } = await db.query(`SELECT * FROM auth_challenge WHERE email = $1 AND purpose = $2
    ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`, [email, purpose]);
  const r = rows[0];
  if (!r || r.used_at || r.expires_at <= now) return { status: 'invalid' };
  if (r.attempts >= OTP_MAX_ATTEMPTS) return { status: 'locked' };
  if (!safeEqualHex(r.code_hash, codeHash)) {
    await db.query('UPDATE auth_challenge SET attempts = attempts + 1 WHERE id = $1', [r.id]);
    return { status: r.attempts + 1 >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid' };
  }
  await db.query('UPDATE auth_challenge SET used_at = $2 WHERE id = $1', [r.id, now]);
  return { status: 'ok', data: { userId: r.user_id === null ? null : String(r.user_id), firstName: r.first_name, lastName: r.last_name, passwordHash: r.password_hash, googleSub: r.google_sub } };
}

export async function setUserPassword(db: pg.ClientBase, userId: string, passwordHash: string, now: Date): Promise<boolean> {
  const { rows } = await db.query(`UPDATE app_user SET password_hash = $2, auth_version = auth_version + 1,
    email_verified_at = coalesce(email_verified_at, $3) WHERE id = $1 AND deleted_at IS NULL AND deletion_requested_at IS NULL RETURNING email`, [userId, passwordHash, now]);
  if (!rows[0]) return false;
  await db.query('UPDATE user_session SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, now]);
  await db.query('UPDATE email_code SET used_at = $2 WHERE email_canonical(email::text) = email_canonical($1) AND used_at IS NULL', [rows[0].email, now]);
  await db.query('UPDATE auth_challenge SET used_at = $2 WHERE email_canonical(email::text) = email_canonical($1) AND used_at IS NULL', [rows[0].email, now]);
  return true;
}
