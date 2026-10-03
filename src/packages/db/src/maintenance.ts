// Partition lifecycle and retention purges (partitioning.md §3). Runs as the owner role.

import type pg from 'pg';
import { purgeExpiredContent } from './community.ts';

const RETENTION: ReadonlyArray<{ parent: string; scheme: 'monthly' | 'daily'; keepMs: number; timeColumn: string }> = [
  { parent: 'ip_log', scheme: 'monthly', keepMs: 180 * 86_400_000, timeColumn: 'at' }, // PRD-005 OQ-005.6
  { parent: 'live_event', scheme: 'daily', keepMs: 2 * 86_400_000, timeColumn: 'created_at' }, // ADR-005: 24 h + 1 day margin
  { parent: 'ai_call', scheme: 'monthly', keepMs: 730 * 86_400_000, timeColumn: 'called_at' }, // [ASSUMPTION] 24 months
];

function partitionEnd(name: string, parent: string, scheme: 'monthly' | 'daily'): Date | null {
  const m = scheme === 'monthly' ? name.match(new RegExp(`^${parent}_(\\d{4})(\\d{2})$`)) : name.match(new RegExp(`^${parent}_(\\d{4})(\\d{2})(\\d{2})$`));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1];
  return scheme === 'monthly' ? new Date(Date.UTC(y, mo, 1)) : new Date(Date.UTC(y, mo - 1, d + 1));
}

export interface MaintenanceResult {
  dropped: string[];
  defaultRowsPurged: number;
  removedContent: number;
  revisions: number;
  pendingSignups: number;
}

// A partition goes only when its whole range is past the window; stragglers in the default
// partition are deleted row by row so the retention promise holds there too.
export async function runMaintenance(db: pg.ClientBase, now: Date): Promise<MaintenanceResult> {
  await db.query(`SELECT ensure_monthly_partitions('audit_log', 3), ensure_monthly_partitions('ip_log', 3),
                         ensure_monthly_partitions('ai_call', 3), ensure_daily_partitions('live_event', 3)`);
  const dropped: string[] = [];
  let defaultRowsPurged = 0;
  for (const r of RETENTION) {
    const cutoff = new Date(now.getTime() - r.keepMs);
    const { rows } = await db.query(
      `SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = $1`,
      [r.parent],
    );
    for (const { relname } of rows) {
      const end = partitionEnd(relname, r.parent, r.scheme);
      if (end && end <= cutoff) {
        await db.query(`DROP TABLE ${relname}`);
        dropped.push(relname);
      }
    }
    const del = await db.query(`DELETE FROM ${r.parent}_default WHERE ${r.timeColumn} < $1`, [cutoff]);
    defaultRowsPurged += del.rowCount ?? 0;
  }
  return { dropped, defaultRowsPurged, ...(await purgeExpiredContent(db, now)) };
}

// Operator roles need two-factor enrolment first; the schema refuses otherwise (PRD-007 US-007.5 AC-2).
export async function grantRole(db: pg.ClientBase, username: string, role: 'user' | 'operator' | 'admin', now: Date): Promise<'granted' | 'unknown_user' | 'totp_required'> {
  const { rows } = await db.query('SELECT id, public_id, role, totp_enabled FROM app_user WHERE username = $1 AND deleted_at IS NULL', [username]);
  const u = rows[0];
  if (!u) return 'unknown_user';
  if (role !== 'user' && !u.totp_enabled) return 'totp_required';
  await db.query('BEGIN');
  try {
    await db.query('UPDATE app_user SET role = $2 WHERE id = $1', [u.id, role]);
    await db.query(
      `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, before, after) VALUES ($1, 'system', NULL, 'user.role_changed', 'user', $2, $3, $4)`,
      [now, u.public_id, { role: u.role }, { role }],
    );
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
  return 'granted';
}

// Founder-side settings changes from the host (e.g. `ai_enabled` once API credentials exist).
export async function setSettingFromCli(db: pg.ClientBase, key: string, value: unknown, now: Date): Promise<boolean> {
  await db.query('BEGIN');
  try {
    const prev = await db.query('SELECT value FROM setting WHERE key = $1 FOR UPDATE', [key]);
    if (!prev.rows[0]) {
      await db.query('ROLLBACK');
      return false;
    }
    await db.query('UPDATE setting SET value = $2, updated_at = $3, updated_by = NULL WHERE key = $1', [key, JSON.stringify(value), now]);
    await db.query(
      `INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, before, after) VALUES ($1, 'system', NULL, 'setting.changed', 'setting', $2, $3, $4)`,
      [now, key, { value: prev.rows[0].value }, { value, via: 'admin_cli' }],
    );
    await db.query('COMMIT');
    return true;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}
