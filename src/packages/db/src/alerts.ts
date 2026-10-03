import type pg from 'pg';
import { newPublicId } from '@stockpanic/core';
import type { CsvRow } from '@stockpanic/core';

export const ALERTS_QUEUE = 'alerts';
const TODAY_IST = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

// ---------------------------------------------------------------- watchlist (PRD-003 §2)

export async function listWatchlist(db: pg.ClientBase, userId: string) {
  const { rows } = await db.query(
    `SELECT w.isin, w.added_at, w.alerts_enabled, i.status, n.name,
            coalesce(nse.code, bse.code) AS display_symbol,
            (SELECT max(t.story_first_seen_at) FROM story_tag_display d JOIN story_tag t ON t.story_id = d.story_id AND t.isin = d.isin
              WHERE d.isin = w.isin) AS latest_story_at
       FROM watchlist_entry w JOIN instrument i ON i.isin = w.isin
       LEFT JOIN instrument_name n ON n.isin = w.isin AND n.kind = 'legal' AND n.valid @> ${TODAY_IST}
       LEFT JOIN instrument_code nse ON nse.isin = w.isin AND nse.exchange = 'NSE' AND nse.valid @> ${TODAY_IST}
       LEFT JOIN instrument_code bse ON bse.isin = w.isin AND bse.exchange = 'BSE' AND bse.valid @> ${TODAY_IST}
      WHERE w.user_id = $1
      ORDER BY w.added_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    isin: r.isin.trim(),
    display_symbol: r.display_symbol,
    name: r.name,
    status: r.status,
    latest_story_at: r.latest_story_at,
    added_at: r.added_at,
  }));
}

export type AddResult = 'added' | 'exists' | 'limit' | 'unknown';

export async function addToWatchlist(db: pg.ClientBase, userId: string, isin: string, limit: number): Promise<AddResult> {
  await db.query('BEGIN');
  try {
    // Serialise per user so two concurrent adds cannot both pass the limit check.
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`watchlist:${userId}`]);
    if (!(await db.query('SELECT 1 FROM instrument WHERE isin = $1', [isin])).rowCount) {
      await db.query('ROLLBACK');
      return 'unknown';
    }
    if ((await db.query('SELECT 1 FROM watchlist_entry WHERE user_id = $1 AND isin = $2', [userId, isin])).rowCount) {
      await db.query('ROLLBACK');
      return 'exists';
    }
    const { rows } = await db.query('SELECT count(*)::int AS n FROM watchlist_entry WHERE user_id = $1', [userId]);
    if (rows[0].n >= limit) {
      await db.query('ROLLBACK');
      return 'limit';
    }
    await db.query('INSERT INTO watchlist_entry (user_id, isin) VALUES ($1, $2)', [userId, isin]);
    await db.query('COMMIT');
    return 'added';
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

export async function removeFromWatchlist(db: pg.ClientBase, userId: string, isin: string): Promise<boolean> {
  return ((await db.query('DELETE FROM watchlist_entry WHERE user_id = $1 AND isin = $2', [userId, isin])).rowCount ?? 0) > 0;
}

// PRD-003 US-003.2 AC-2: ISIN first; a symbol matches only if it maps to exactly one instrument.
export async function matchImportRows(db: pg.ClientBase, userId: string, rows: readonly CsvRow[]) {
  const matched: { isin: string; display_symbol: string | null; row: number; already_on_watchlist: boolean }[] = [];
  const unmatched: { row: number; raw: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    let isin: string | null = null;
    if (r.isin) {
      const hit = await db.query('SELECT isin FROM instrument WHERE isin = $1', [r.isin]);
      isin = hit.rows[0]?.isin.trim() ?? null;
    }
    if (!isin && r.symbol) {
      const hit = await db.query(`SELECT DISTINCT isin FROM instrument_code WHERE upper(code) = $1 AND valid @> ${TODAY_IST}`, [r.symbol]);
      if (hit.rows.length === 1) isin = hit.rows[0].isin.trim();
    }
    if (!isin) {
      unmatched.push({ row: r.row, raw: r.raw });
      continue;
    }
    if (seen.has(isin)) continue;
    seen.add(isin);
    const sym = await db.query(
      `SELECT coalesce(max(code) FILTER (WHERE exchange = 'NSE'), max(code)) AS s FROM instrument_code WHERE isin = $1 AND valid @> ${TODAY_IST}`,
      [isin],
    );
    const already = !!(await db.query('SELECT 1 FROM watchlist_entry WHERE user_id = $1 AND isin = $2', [userId, isin])).rowCount;
    matched.push({ isin, display_symbol: sym.rows[0]?.s ?? null, row: r.row, already_on_watchlist: already });
  }
  return { matched, unmatched };
}

// Additive only (US-003.2 AC-5); never removes instruments already on the watchlist.
export async function importToWatchlist(db: pg.ClientBase, userId: string, isins: readonly string[], limit: number) {
  let added = 0;
  let skippedExisting = 0;
  let skippedOverLimit = 0;
  for (const isin of new Set(isins)) {
    const r = await addToWatchlist(db, userId, isin, limit);
    if (r === 'added') added++;
    else if (r === 'exists') skippedExisting++;
    else if (r === 'limit') skippedOverLimit++;
  }
  return { added, skipped_existing: skippedExisting, skipped_over_limit: skippedOverLimit };
}

// ---------------------------------------------------------------- alert settings (PRD-003 §5.3)

export async function loadAlertSettings(db: pg.ClientBase, userId: string, defaultBudget: number) {
  await db.query('INSERT INTO alert_settings (user_id, daily_budget) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, defaultBudget]);
  const s = (await db.query('SELECT * FROM alert_settings WHERE user_id = $1', [userId])).rows[0];
  const prefs = await db.query(
    `SELECT e.code, coalesce(p.enabled, e.alert_default) AS enabled FROM event_type e
       LEFT JOIN alert_event_type_pref p ON p.code = e.code AND p.user_id = $1
      WHERE e.retired_to IS NULL ORDER BY e.code`,
    [userId],
  );
  const used = await db.query(`SELECT coalesce(max(used), 0)::int AS used FROM alert_budget_usage WHERE user_id = $1 AND day = ${TODAY_IST}`, [userId]);
  return {
    channels: { email: s.email_enabled as boolean, push: s.push_enabled as boolean },
    daily_budget: s.daily_budget as number,
    used_today: used.rows[0].used as number,
    quiet_hours: { enabled: s.quiet_enabled as boolean, start: String(s.quiet_start).slice(0, 5), end: String(s.quiet_end).slice(0, 5), tz: 'Asia/Kolkata' },
    digest: { time: String(s.digest_time).slice(0, 5), digest_only: s.digest_only as boolean },
    event_types: Object.fromEntries(prefs.rows.map((r) => [r.code, r.enabled])),
    email_disabled_after_bounces: s.email_bounces >= 3,
  };
}

export interface AlertSettingsPatch {
  email?: boolean;
  push?: boolean;
  dailyBudget?: number;
  quietEnabled?: boolean;
  quietStart?: string;
  quietEnd?: string;
  digestTime?: string;
  digestOnly?: boolean;
  eventTypes?: Record<string, boolean>;
}

export async function updateAlertSettings(db: pg.ClientBase, userId: string, p: AlertSettingsPatch): Promise<void> {
  await db.query(
    `UPDATE alert_settings SET
       email_enabled = coalesce($2, email_enabled),
       email_bounces = CASE WHEN $2 IS TRUE THEN 0 ELSE email_bounces END,
       push_enabled = coalesce($3, push_enabled), daily_budget = coalesce($4, daily_budget),
       quiet_enabled = coalesce($5, quiet_enabled), quiet_start = coalesce($6::time, quiet_start),
       quiet_end = coalesce($7::time, quiet_end), digest_time = coalesce($8::time, digest_time),
       digest_only = coalesce($9, digest_only)
     WHERE user_id = $1`,
    [userId, p.email ?? null, p.push ?? null, p.dailyBudget ?? null, p.quietEnabled ?? null, p.quietStart ?? null, p.quietEnd ?? null, p.digestTime ?? null, p.digestOnly ?? null],
  );
  for (const [code, enabled] of Object.entries(p.eventTypes ?? {})) {
    await db.query(
      `INSERT INTO alert_event_type_pref (user_id, code, enabled) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, code) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [userId, code, enabled],
    );
  }
}

export async function disableEmailAlerts(db: pg.ClientBase, userPublicId: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT id FROM app_user WHERE public_id = $1 AND deleted_at IS NULL`, [userPublicId]);
  if (!rows[0]) return false;
  await db.query(
    `INSERT INTO alert_settings (user_id, daily_budget, email_enabled) VALUES ($1, 0, false)
     ON CONFLICT (user_id) DO UPDATE SET email_enabled = false`,
    [rows[0].id],
  );
  return true;
}

export async function savePushSubscription(db: pg.ClientBase, userId: string, endpoint: string, keys: { p256dh: string; auth: string }): Promise<void> {
  await db.query(
    `INSERT INTO push_subscription (user_id, endpoint, keys) VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
    [userId, endpoint, keys],
  );
}

export async function deletePushSubscription(db: pg.ClientBase, endpoint: string, userId: string | null = null): Promise<void> {
  await db.query('DELETE FROM push_subscription WHERE endpoint = $1 AND ($2::bigint IS NULL OR user_id = $2::bigint)', [endpoint, userId]);
}

export async function pushSubscriptions(db: pg.ClientBase, userId: string) {
  const { rows } = await db.query('SELECT endpoint, keys FROM push_subscription WHERE user_id = $1', [userId]);
  return rows.map((r) => ({ endpoint: r.endpoint as string, keys: r.keys as { p256dh: string; auth: string } }));
}

// ---------------------------------------------------------------- evaluation (PRD-003 §3.1)

export interface AlertTarget {
  userId: string;
  userPublicId: string;
  email: string | null;
  isins: string[];
  emailEnabled: boolean;
  pushEnabled: boolean;
  dailyBudget: number;
  budgetCeiling: number;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  digestOnly: boolean;
}

// Users for whom the story is alert-worthy (US-003.5 AC-1…AC-3, §7): the instrument is on their
// watchlist (added before the story appeared, within their tier limit), and one of the story's
// event types is enabled for them. Directional votes, comments and Trending play no part (C-003.3).
export async function alertTargets(db: pg.ClientBase, storyId: string): Promise<AlertTarget[]> {
  const { rows } = await db.query(
    `WITH story_isins AS (SELECT isin FROM story_tag_display WHERE story_id = $1),
          ranked AS (
            SELECT w.user_id, w.isin, w.added_at, w.alerts_enabled,
                   row_number() OVER (PARTITION BY w.user_id ORDER BY w.added_at DESC, w.isin) AS rank
              FROM watchlist_entry w)
     SELECT u.id, u.public_id, u.email, array_agg(DISTINCT r.isin::text) AS isins, -- ::text: pg cannot parse arrays of the isin_code domain
            coalesce(s.email_enabled, true) AS email_enabled, coalesce(s.push_enabled, false) AS push_enabled,
            coalesce(s.daily_budget, pe.default_alert_budget) AS daily_budget, pe.alert_budget_ceiling,
            coalesce(s.quiet_enabled, true) AS quiet_enabled, coalesce(s.quiet_start, '22:00')::text AS quiet_start,
            coalesce(s.quiet_end, '08:00')::text AS quiet_end, coalesce(s.digest_only, false) AS digest_only
       FROM ranked r
       JOIN app_user u ON u.id = r.user_id
       JOIN user_tier t ON t.user_id = u.id
       JOIN plan_entitlement pe ON pe.tier = t.tier
       JOIN story s0 ON s0.id = $1
       LEFT JOIN alert_settings s ON s.user_id = u.id
      WHERE r.isin IN (SELECT isin FROM story_isins)
        AND r.alerts_enabled AND r.rank <= pe.watchlist_limit
        AND r.added_at <= s0.first_seen_at
        AND u.deleted_at IS NULL AND u.deletion_requested_at IS NULL
        AND EXISTS (SELECT 1 FROM story_event_type se JOIN event_type e ON e.code = se.code
                     LEFT JOIN alert_event_type_pref p ON p.user_id = u.id AND p.code = se.code
                     WHERE se.story_id = $1 AND coalesce(p.enabled, e.alert_default))
      GROUP BY u.id, u.public_id, u.email, s.email_enabled, s.push_enabled, s.daily_budget, pe.default_alert_budget,
               pe.alert_budget_ceiling, s.quiet_enabled, s.quiet_start, s.quiet_end, s.digest_only
      ORDER BY u.id`,
    [storyId],
  );
  return rows.map((r) => ({
    userId: String(r.id),
    userPublicId: r.public_id,
    email: r.email,
    isins: r.isins.map((x: string) => x.trim()),
    emailEnabled: r.email_enabled,
    pushEnabled: r.push_enabled,
    dailyBudget: r.daily_budget,
    budgetCeiling: r.alert_budget_ceiling,
    quietEnabled: r.quiet_enabled,
    quietStart: r.quiet_start,
    quietEnd: r.quiet_end,
    digestOnly: r.digest_only,
  }));
}

// One alert per story per user, ever: the partial unique index decides (NFR-003.6).
export async function recordAlert(db: pg.ClientBase, userId: string, storyId: string, via: 'individual' | 'digest', channels: string[]) {
  const { rows } = await db.query(
    `INSERT INTO alert (public_id, user_id, story_id, kind, via, channels) VALUES ($1, $2, $3, 'alert', $4, $5)
     ON CONFLICT (user_id, story_id) WHERE kind = 'alert' DO NOTHING
     RETURNING id, public_id`,
    [newPublicId('al'), userId, storyId, via, channels],
  );
  return rows[0] ? { id: String(rows[0].id), publicId: rows[0].public_id as string } : null;
}

export async function usageToday(db: pg.ClientBase, userId: string, day: string): Promise<number> {
  const { rows } = await db.query('SELECT used FROM alert_budget_usage WHERE user_id = $1 AND day = $2', [userId, day]);
  return rows[0]?.used ?? 0;
}

export async function consumeBudget(db: pg.ClientBase, userId: string, day: string): Promise<void> {
  await db.query(
    `INSERT INTO alert_budget_usage (user_id, day, used) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET used = alert_budget_usage.used + 1`,
    [userId, day],
  );
}

export async function markAlertSent(db: pg.ClientBase, alertId: string, at: Date): Promise<void> {
  await db.query('UPDATE alert SET sent_at = $2 WHERE id = $1', [alertId, at]);
}

// Nothing reached the user individually: hold it for the digest instead (C-003.4).
export async function moveAlertToDigest(db: pg.ClientBase, alertId: string): Promise<void> {
  await db.query(`UPDATE alert SET via = 'digest', channels = ARRAY['email'] WHERE id = $1`, [alertId]);
}

export async function noteEmailFailure(db: pg.ClientBase, userId: string): Promise<void> {
  await db.query(
    `UPDATE alert_settings SET email_bounces = email_bounces + 1, email_enabled = (email_bounces + 1 < 3) WHERE user_id = $1`,
    [userId],
  );
}

export async function enqueueAlertEvaluation(db: pg.ClientBase, storyId: string): Promise<void> {
  await db.query('INSERT INTO job (queue, priority, payload) VALUES ($1, 10, $2)', [ALERTS_QUEUE, { story_id: storyId }]);
}

// ---------------------------------------------------------------- corrections (PRD-003 US-003.8)

// Users alerted for the story whose watchlist match was only the removed instrument.
export async function alertsToCorrect(db: pg.ClientBase, storyId: string, removedIsin: string) {
  const { rows } = await db.query(
    `SELECT a.id, a.public_id, a.user_id, coalesce(a.sent_at, a.created_at) AS received_at FROM alert a
      WHERE a.story_id = $1 AND a.kind = 'alert' AND a.corrected_at IS NULL
        AND EXISTS (SELECT 1 FROM watchlist_entry w WHERE w.user_id = a.user_id AND w.isin = $2)
        AND NOT EXISTS (SELECT 1 FROM watchlist_entry w JOIN story_tag_display d ON d.isin = w.isin
                         WHERE w.user_id = a.user_id AND d.story_id = $1)`,
    [storyId, removedIsin],
  );
  return rows.map((r) => ({ alertId: String(r.id), alertPublicId: r.public_id as string, userId: String(r.user_id), sentAt: r.received_at as Date }));
}

export async function recordCorrection(db: pg.ClientBase, original: { alertId: string; userId: string }, storyId: string, removedIsin: string, via: 'individual' | 'digest') {
  await db.query('UPDATE alert SET corrected_at = now() WHERE id = $1', [original.alertId]);
  const { rows } = await db.query(
    `INSERT INTO alert (public_id, user_id, story_id, kind, via, channels, corrects_alert_id, removed_isin)
     VALUES ($1, $2, $3, 'correction', $4, ARRAY['email'], $5, $6) RETURNING id, public_id`,
    [newPublicId('al'), original.userId, storyId, via, original.alertId, removedIsin],
  );
  return { id: String(rows[0].id), publicId: rows[0].public_id as string };
}

// ---------------------------------------------------------------- digest (PRD-003 US-003.7 AC-5)

export async function digestCandidates(db: pg.ClientBase) {
  const { rows } = await db.query(
    `SELECT DISTINCT a.user_id, u.public_id, u.email, coalesce(s.digest_time, '08:00')::text AS digest_time,
            coalesce(s.email_enabled, true) AS email_enabled
       FROM alert a JOIN app_user u ON u.id = a.user_id LEFT JOIN alert_settings s ON s.user_id = a.user_id
      WHERE a.via = 'digest' AND a.sent_at IS NULL AND u.deleted_at IS NULL AND u.email IS NOT NULL`,
  );
  return rows.map((r) => ({ userId: String(r.user_id), userPublicId: r.public_id as string, email: r.email as string, digestTime: r.digest_time as string, emailEnabled: r.email_enabled as boolean }));
}

export async function heldAlerts(db: pg.ClientBase, userId: string) {
  const { rows } = await db.query(
    `SELECT id, public_id, story_id, kind, removed_isin, corrects_alert_id FROM alert
      WHERE user_id = $1 AND via = 'digest' AND sent_at IS NULL ORDER BY created_at`,
    [userId],
  );
  return rows.map((r) => ({ id: String(r.id), publicId: r.public_id as string, storyId: String(r.story_id), kind: r.kind as 'alert' | 'correction', removedIsin: r.removed_isin as string | null }));
}

// One digest per user per IST day; returns null if today's digest already went out.
export async function recordDigest(db: pg.ClientBase, userId: string, day: string, alertIds: readonly string[], storyIds: readonly string[], at: Date): Promise<string | null> {
  const { rows } = await db.query(
    'INSERT INTO digest (user_id, for_date, sent_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, for_date) DO NOTHING RETURNING id',
    [userId, day, at],
  );
  if (!rows[0]) return null;
  for (const s of new Set(storyIds)) await db.query('INSERT INTO digest_item (digest_id, story_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].id, s]);
  await db.query('UPDATE alert SET sent_at = $2 WHERE id = ANY($1::bigint[])', [alertIds, at]);
  return String(rows[0].id);
}

// ---------------------------------------------------------------- history (PRD-003 §5.5)

export async function alertHistory(db: pg.ClientBase, userId: string, sinceDays: number, before: { at: Date; id: string } | null, limit: number) {
  const { rows } = await db.query(
    `SELECT a.id, a.public_id, a.kind, a.via, a.channels, a.created_at, a.sent_at, a.corrected_at IS NOT NULL AS corrected,
            s.public_id AS story_id, p.headline
       FROM alert a JOIN story s ON s.id = a.story_id LEFT JOIN item p ON p.id = s.primary_item_id
      WHERE a.user_id = $1 AND a.created_at >= now() - make_interval(days => $2)
        AND ($3::timestamptz IS NULL OR (a.created_at, a.id) < ($3::timestamptz, $4::bigint))
      ORDER BY a.created_at DESC, a.id DESC LIMIT $5`,
    [userId, sinceDays, before?.at ?? null, before?.id ?? null, limit],
  );
  return rows;
}
