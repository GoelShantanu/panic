import type pg from 'pg';
import {
  DELETED_USERNAME_HOLD_DAYS,
  DELETION_DEADLINE_DAYS,
  EXPORT_TTL_DAYS,
  OTP_MAX_ATTEMPTS,
  SESSION_IDLE_DAYS,
  TRIAL_DAYS,
  USERNAME_CHANGE_INTERVAL_DAYS,
  USERNAME_HOLD_DAYS,
  daysFrom,
  newPublicId,
  safeEqualHex,
} from '@stockpanic/core';
import type { Tier } from '@stockpanic/core';

export const ACCOUNT_QUEUE = 'account';

async function tx<T>(db: pg.ClientBase, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    const r = await fn();
    await db.query('COMMIT');
    return r;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------- sign-in codes (PRD-007 US-007.1 AC-3)

export async function recentCodeCount(db: pg.ClientBase, email: string, since: Date): Promise<number> {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM email_code WHERE email = $1 AND created_at > $2', [email, since]);
  return rows[0].n;
}

export async function createEmailCode(db: pg.ClientBase, email: string, codeHash: string, now: Date, expiresAt: Date): Promise<void> {
  await db.query('INSERT INTO email_code (email, code_hash, created_at, expires_at) VALUES ($1, $2, $3, $4)', [email, codeHash, now, expiresAt]);
}

export type CodeCheck = 'ok' | 'invalid' | 'locked';

// Checks the newest live code; a wrong guess counts towards the lock; a match is single-use.
export async function checkEmailCode(db: pg.ClientBase, email: string, codeHash: string, now: Date): Promise<CodeCheck> {
  return tx(db, async () => {
    const { rows } = await db.query(
      `SELECT id, code_hash, attempts FROM email_code
        WHERE email = $1 AND used_at IS NULL AND expires_at > $2
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [email, now],
    );
    const row = rows[0];
    if (!row) return 'invalid';
    if (row.attempts >= OTP_MAX_ATTEMPTS) return 'locked';
    if (safeEqualHex(row.code_hash, codeHash)) {
      await db.query('UPDATE email_code SET used_at = $2 WHERE id = $1', [row.id, now]);
      return 'ok';
    }
    const upd = await db.query('UPDATE email_code SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts', [row.id]);
    return upd.rows[0].attempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid';
  });
}

// ---------------------------------------------------------------- users

export interface UserRef {
  id: string;
  publicId: string;
  username: string;
}

const userRef = (r: any): UserRef => ({ id: String(r.id), publicId: r.public_id, username: r.username });

export async function findUserByEmail(db: pg.ClientBase, email: string): Promise<UserRef | null> {
  const { rows } = await db.query('SELECT id, public_id, username FROM app_user WHERE email = $1 AND deleted_at IS NULL AND deletion_requested_at IS NULL', [email]);
  return rows[0] ? userRef(rows[0]) : null;
}

export async function findUserByGoogleSub(db: pg.ClientBase, sub: string): Promise<UserRef | null> {
  const { rows } = await db.query('SELECT id, public_id, username FROM app_user WHERE google_sub = $1 AND deleted_at IS NULL AND deletion_requested_at IS NULL', [sub]);
  return rows[0] ? userRef(rows[0]) : null;
}

// PRD-007 §6: the same email through email-code and Google is one account.
export async function linkGoogleSub(db: pg.ClientBase, userId: string, sub: string): Promise<void> {
  await db.query('UPDATE app_user SET google_sub = $2, email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1', [userId, sub]);
}

export interface PendingIdentity {
  email: string | null;
  googleSub: string | null;
}

export async function createPendingSignup(db: pg.ClientBase, tokenHash: string, id: PendingIdentity, expiresAt: Date): Promise<void> {
  await db.query('INSERT INTO pending_signup (token_hash, email, google_sub, expires_at) VALUES ($1, $2, $3, $4)', [tokenHash, id.email, id.googleSub, expiresAt]);
}

export async function takePendingSignup(db: pg.ClientBase, tokenHash: string, now: Date): Promise<PendingIdentity | null> {
  const { rows } = await db.query('DELETE FROM pending_signup WHERE token_hash = $1 AND expires_at > $2 RETURNING email, google_sub', [tokenHash, now]);
  return rows[0] ? { email: rows[0].email, googleSub: rows[0].google_sub } : null;
}

export type UserError = 'username_taken' | 'username_reserved' | 'email_taken';

function userError(err: unknown): UserError | null {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code === '23505' && e.constraint === 'app_user_username_key') return 'username_taken';
  if (e.code === '23505' && (e.constraint === 'app_user_email_key' || e.constraint === 'app_user_google_sub_key')) return 'email_taken';
  if (typeof e.message === 'string' && e.message.startsWith('username_reserved')) return 'username_reserved';
  return null;
}

export interface NewUser {
  username: string;
  email: string | null;
  googleSub: string | null;
  marketingOptIn: boolean;
  now: Date;
}

// Runs inside the caller's transaction; on a known error the caller must roll back.
export async function createUser(db: pg.ClientBase, u: NewUser): Promise<{ ok: true; user: UserRef } | { ok: false; error: UserError }> {
  try {
    const { rows } = await db.query(
      `INSERT INTO app_user (public_id, username, email, email_verified_at, google_sub, age_confirmed_at, terms_accepted_at, privacy_consent_at, marketing_opt_in)
       VALUES ($1, $2, $3, $4, $5, $4, $4, $4, $6) RETURNING id, public_id, username`,
      [newPublicId('us'), u.username, u.email, u.now, u.googleSub, u.marketingOptIn],
    );
    return { ok: true, user: userRef(rows[0]) };
  } catch (err) {
    const known = userError(err);
    if (known) return { ok: false, error: known };
    throw err;
  }
}

// ---------------------------------------------------------------- sessions (PRD-007 US-007.1 AC-6)

export async function createSession(db: pg.ClientBase, tokenHash: string, userId: string, now: Date): Promise<void> {
  await db.query('INSERT INTO user_session (token_hash, user_id, created_at, last_seen_at) VALUES ($1, $2, $3, $3)', [tokenHash, userId, now]);
}

export interface SessionUser extends UserRef {
  tier: Tier;
}

export async function sessionUser(db: pg.ClientBase, tokenHash: string, now: Date): Promise<SessionUser | null> {
  const { rows } = await db.query(
    `SELECT u.id, u.public_id, u.username, t.tier, s.last_seen_at
       FROM user_session s JOIN app_user u ON u.id = s.user_id JOIN user_tier t ON t.user_id = u.id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND u.deleted_at IS NULL AND u.deletion_requested_at IS NULL
        AND s.last_seen_at > $2::timestamptz - make_interval(days => $3)`,
    [tokenHash, now, SESSION_IDLE_DAYS],
  );
  const r = rows[0];
  if (!r) return null;
  if (now.getTime() - new Date(r.last_seen_at).getTime() > 5 * 60_000) {
    await db.query('UPDATE user_session SET last_seen_at = $2 WHERE token_hash = $1', [tokenHash, now]);
  }
  return { ...userRef(r), tier: r.tier };
}

export async function revokeSession(db: pg.ClientBase, tokenHash: string, now: Date): Promise<void> {
  await db.query('UPDATE user_session SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash, now]);
}

export async function revokeAllSessions(db: pg.ClientBase, userId: string, now: Date): Promise<void> {
  await db.query('UPDATE user_session SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, now]);
}

// ---------------------------------------------------------------- me, trial, username

export async function loadMe(db: pg.ClientBase, userId: string) {
  const { rows } = await db.query(
    `SELECT u.public_id, u.username, u.email, u.created_at, u.email_verified_at IS NOT NULL AS email_verified,
            t.tier, tr.ends_at AS trial_ends_at,
            (SELECT row_to_json(x) FROM (SELECT plan, status, current_period_end AS renews_at, cancel_at_period_end
               FROM subscription s WHERE s.user_id = u.id AND s.status <> 'expired' ORDER BY s.created_at DESC LIMIT 1) x) AS subscription
       FROM app_user u JOIN user_tier t ON t.user_id = u.id LEFT JOIN trial tr ON tr.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function startTrial(db: pg.ClientBase, userId: string, now: Date): Promise<{ ok: true; endsAt: Date } | { ok: false }> {
  const { rows } = await db.query(
    'INSERT INTO trial (user_id, started_at, ends_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING RETURNING ends_at',
    [userId, now, daysFrom(now, TRIAL_DAYS)],
  );
  return rows[0] ? { ok: true, endsAt: rows[0].ends_at } : { ok: false };
}

export type UsernameChange = { ok: true } | { ok: false; error: UserError } | { ok: false; error: 'too_soon'; availableFrom: Date };

// PRD-007 US-007.2 AC-3: once per 30 days; the old name is held for 30 days.
export async function changeUsername(db: pg.ClientBase, userId: string, username: string, now: Date): Promise<UsernameChange> {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query('SELECT username, username_changed_at FROM app_user WHERE id = $1 FOR UPDATE', [userId]);
    const cur = rows[0];
    if (cur.username_changed_at) {
      const availableFrom = daysFrom(cur.username_changed_at, USERNAME_CHANGE_INTERVAL_DAYS);
      if (now < availableFrom) {
        await db.query('ROLLBACK');
        return { ok: false, error: 'too_soon', availableFrom };
      }
    }
    await db.query(
      `INSERT INTO username_hold (username, user_id, held_until) VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET user_id = EXCLUDED.user_id, held_until = EXCLUDED.held_until`,
      [cur.username, userId, daysFrom(now, USERNAME_HOLD_DAYS)],
    );
    await db.query('UPDATE app_user SET username = $2, username_changed_at = $3 WHERE id = $1', [userId, username, now]);
    await db.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await db.query('ROLLBACK');
    const known = userError(err);
    if (known) return { ok: false, error: known };
    throw err;
  }
}

// ---------------------------------------------------------------- deletion (PRD-007 US-007.3, §1.4)

export type CommentChoice = 'keep_as_deleted_user' | 'delete';

export async function requestDeletion(db: pg.ClientBase, userId: string, choice: CommentChoice, now: Date): Promise<Date> {
  return tx(db, async () => {
    await db.query('UPDATE app_user SET deletion_requested_at = $2, deletion_comments = $3 WHERE id = $1', [userId, now, choice]);
    await revokeAllSessions(db, userId, now);
    await db.query(
      `UPDATE subscription SET status = 'cancelled', cancel_at_period_end = true WHERE user_id = $1 AND status IN ('active', 'past_due')`,
      [userId],
    );
    await db.query('INSERT INTO job (queue, payload) VALUES ($1, $2)', [ACCOUNT_QUEUE, { kind: 'delete', user_id: userId }]);
    await db.query(
      `INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, after)
       SELECT 'user', id, 'account.deletion_requested', 'user', public_id, jsonb_build_object('comments', $2::text) FROM app_user WHERE id = $1`,
      [userId, choice],
    );
    return daysFrom(now, DELETION_DEADLINE_DAYS);
  });
}

// Erases personal data; keeps the pseudonymous row so votes stay counted and comments keep their
// threads (PRD-007 §1.4). Invoices are retained for tax records. Idempotent. Caller's transaction.
export async function processDeletion(db: pg.ClientBase, userId: string, now: Date): Promise<'deleted' | 'already'> {
  const { rows } = await db.query('SELECT public_id, username, email, deletion_comments, deleted_at FROM app_user WHERE id = $1 FOR UPDATE', [userId]);
  const u = rows[0];
  if (!u) throw new Error(`user ${userId} not found`);
  if (u.deleted_at) return 'already';

  if (u.deletion_comments === 'delete') {
    await db.query(`UPDATE comment SET state = 'deleted_by_author', body = NULL WHERE user_id = $1 AND state = 'visible'`, [userId]);
  }
  for (const table of ['watchlist_entry', 'alert_settings', 'alert_event_type_pref', 'push_subscription', 'saved_view', 'stream_seen', 'user_session', 'data_export', 'alert_budget_usage']) {
    await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  }
  await db.query(`DELETE FROM digest_item WHERE digest_id IN (SELECT id FROM digest WHERE user_id = $1)`, [userId]);
  await db.query(`DELETE FROM digest WHERE user_id = $1`, [userId]);
  await db.query(`DELETE FROM alert WHERE user_id = $1 AND kind = 'correction'`, [userId]);
  await db.query(`DELETE FROM alert WHERE user_id = $1`, [userId]);
  if (u.email) {
    await db.query('DELETE FROM email_code WHERE email = $1', [u.email]);
    await db.query('DELETE FROM pending_signup WHERE email = $1', [u.email]);
  }
  await db.query(
    `INSERT INTO username_hold (username, user_id, held_until) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE SET user_id = EXCLUDED.user_id, held_until = EXCLUDED.held_until`,
    [u.username, userId, daysFrom(now, DELETED_USERNAME_HOLD_DAYS)],
  );
  await db.query(
    `UPDATE app_user SET email = NULL, google_sub = NULL, username = NULL, replies_seen_at = NULL, marketing_opt_in = false, deleted_at = $2
      WHERE id = $1`,
    [userId, now],
  );
  await db.query(
    `INSERT INTO audit_log (actor_type, action, entity_type, entity_id) VALUES ('system', 'account.deleted', 'user', $1)`,
    [u.public_id],
  );
  return 'deleted';
}

// ---------------------------------------------------------------- export (PRD-007 US-007.3 AC-5)

export async function createExportRequest(db: pg.ClientBase, userId: string, now: Date): Promise<string> {
  return tx(db, async () => {
    const { rows } = await db.query('INSERT INTO data_export (user_id, requested_at) VALUES ($1, $2) RETURNING id', [userId, now]);
    await db.query('INSERT INTO job (queue, payload) VALUES ($1, $2)', [ACCOUNT_QUEUE, { kind: 'export', export_id: String(rows[0].id) }]);
    return String(rows[0].id);
  });
}

// Caller's transaction.
export async function processExport(db: pg.ClientBase, exportId: string, now: Date): Promise<void> {
  const { rows } = await db.query('SELECT user_id FROM data_export WHERE id = $1', [exportId]);
  if (!rows[0]) throw new Error(`export ${exportId} not found`);
  const userId = rows[0].user_id;
  const q = async (sql: string) => (await db.query(sql, [userId])).rows;
  const data = {
    generated_at: now,
    account: (await q(`SELECT public_id, username, email, created_at, marketing_opt_in FROM app_user WHERE id = $1`))[0],
    watchlist: await q(`SELECT isin, added_at, alerts_enabled FROM watchlist_entry WHERE user_id = $1 ORDER BY added_at`),
    alert_settings: (await q(`SELECT * FROM alert_settings WHERE user_id = $1`))[0] ?? null,
    alerts: await q(`SELECT s.public_id AS story_id, a.kind, a.via, a.channels, a.sent_at FROM alert a JOIN story s ON s.id = a.story_id WHERE a.user_id = $1 ORDER BY a.created_at`),
    votes: await q(`SELECT s.public_id AS story_id, v.direction, v.cast_at FROM vote_directional v JOIN story s ON s.id = v.story_id WHERE v.user_id = $1 ORDER BY v.cast_at`),
    quality_votes: await q(`SELECT s.public_id AS story_id, v.kind, v.cast_at FROM vote_quality v JOIN story s ON s.id = v.story_id WHERE v.user_id = $1 ORDER BY v.cast_at`),
    comments: await q(`SELECT c.public_id, s.public_id AS story_id, c.state, c.body, c.created_at FROM comment c JOIN story s ON s.id = c.story_id WHERE c.user_id = $1 ORDER BY c.created_at`),
  };
  await db.query('UPDATE data_export SET data = $2, ready_at = $3, expires_at = $4 WHERE id = $1', [exportId, data, now, daysFrom(now, EXPORT_TTL_DAYS)]);
}

export async function getExport(db: pg.ClientBase, userId: string, exportId: string, now: Date) {
  if (!/^\d+$/.test(exportId)) return null;
  const { rows } = await db.query('SELECT ready_at, expires_at, data FROM data_export WHERE id = $1 AND user_id = $2', [exportId, userId]);
  const r = rows[0];
  if (!r) return null;
  if (!r.ready_at) return { status: 'pending' as const };
  if (r.expires_at <= now) return { status: 'expired' as const };
  return { status: 'ready' as const, ready_at: r.ready_at, expires_at: r.expires_at, data: r.data };
}
