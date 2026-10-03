// Watchlist, alert settings, history, push subscriptions, unsubscribe, unread marker (PRD-003 §5, PRD-001 §4.3).

import type pg from 'pg';
import { ENTITLEMENTS, isEventTypeCode, parseHoldingsCsv, parseIsin, upgradeRequired, verifyUnsubscribeToken } from '@stockpanic/core';
import {
  addToWatchlist,
  alertHistory,
  deletePushSubscription,
  disableEmailAlerts,
  importToWatchlist,
  listWatchlist,
  loadAlertSettings,
  markSeen,
  matchImportRows,
  removeFromWatchlist,
  savePushSubscription,
  updateAlertSettings,
} from '@stockpanic/db';
import type { AlertSettingsPatch, SessionUser } from '@stockpanic/db';
import { decodeCursor, encodeCursor } from './cursor.ts';

export interface Res {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const authRequired: Res = { status: 401, body: { error: 'auth_required' } };
const invalid = (param: string): Res => ({ status: 400, body: { error: 'invalid_param', param } });
const field = (body: unknown, key: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_CSV_BYTES = 1024 * 1024; // PRD-003 US-003.2 AC-1

// ---------------------------------------------------------------- watchlist

export async function getWatchlist(db: pg.ClientBase, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  return { status: 200, body: { instruments: await listWatchlist(db, user.id), limit: ENTITLEMENTS[user.tier].watchlistLimit } };
}

export async function postWatchlist(db: pg.ClientBase, body: unknown, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const raw = field(body, 'isin');
  const isin = typeof raw === 'string' ? parseIsin(raw) : null;
  if (!isin) return invalid('isin');
  const r = await addToWatchlist(db, user.id, isin, ENTITLEMENTS[user.tier].watchlistLimit);
  if (r === 'added') return { status: 201, body: { isin } };
  if (r === 'exists') return { status: 409, body: { error: 'already_on_watchlist' } };
  if (r === 'limit') return { status: 402, body: upgradeRequired('watchlist_limit') };
  return { status: 404, body: { error: 'not_found' } };
}

export async function deleteWatchlist(db: pg.ClientBase, rawIsin: string, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const isin = parseIsin(rawIsin);
  return isin && (await removeFromWatchlist(db, user.id, isin)) ? { status: 204, body: null } : { status: 404, body: { error: 'not_found' } };
}

// The CSV arrives as text in JSON ({"csv": "…"}): writes are JSON-only (B5 forgery protection).
export async function postImportPreview(db: pg.ClientBase, body: unknown, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const csv = field(body, 'csv');
  if (typeof csv !== 'string' || csv.length === 0) return invalid('csv');
  if (Buffer.byteLength(csv) > MAX_CSV_BYTES) return { status: 413, body: { error: 'file_too_large' } };
  const parsed = parseHoldingsCsv(csv);
  if ('error' in parsed) return { status: 400, body: { error: 'unrecognised_format', detail: parsed.error } };
  const { matched, unmatched } = await matchImportRows(db, user.id, parsed.rows);
  const current = (await listWatchlist(db, user.id)).length;
  const fresh = matched.filter((m) => !m.already_on_watchlist).length;
  const overLimit = Math.max(0, current + fresh - ENTITLEMENTS[user.tier].watchlistLimit);
  return { status: 200, body: { matched, unmatched, over_limit: overLimit } };
}

export async function postImportConfirm(db: pg.ClientBase, body: unknown, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const raw = field(body, 'isins');
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1000) return invalid('isins');
  const isins = raw.map((x) => (typeof x === 'string' ? parseIsin(x) : null));
  if (isins.some((x) => x === null)) return invalid('isins');
  return { status: 200, body: await importToWatchlist(db, user.id, isins as string[], ENTITLEMENTS[user.tier].watchlistLimit) };
}

// ---------------------------------------------------------------- alert settings

export async function getAlertSettings(db: pg.ClientBase, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const ent = ENTITLEMENTS[user.tier];
  const s = await loadAlertSettings(db, user.id, ent.defaultAlertBudget);
  return { status: 200, body: { ...s, daily_budget: Math.min(s.daily_budget, ent.alertBudgetCeiling), budget_ceiling: ent.alertBudgetCeiling } };
}

export async function putAlertSettings(db: pg.ClientBase, body: unknown, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const ent = ENTITLEMENTS[user.tier];
  await loadAlertSettings(db, user.id, ent.defaultAlertBudget); // ensure the row exists
  const patch: AlertSettingsPatch = {};

  const channels = field(body, 'channels');
  if (channels !== undefined) {
    const email = field(channels, 'email');
    const push = field(channels, 'push');
    if ((email !== undefined && typeof email !== 'boolean') || (push !== undefined && typeof push !== 'boolean')) return invalid('channels');
    if (typeof email === 'boolean') patch.email = email;
    if (typeof push === 'boolean') patch.push = push;
  }
  const budget = field(body, 'daily_budget');
  if (budget !== undefined) {
    if (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 0 || budget > ent.alertBudgetCeiling) return invalid('daily_budget');
    patch.dailyBudget = budget;
  }
  const quiet = field(body, 'quiet_hours');
  if (quiet !== undefined) {
    const enabled = field(quiet, 'enabled');
    const start = field(quiet, 'start');
    const end = field(quiet, 'end');
    if (enabled !== undefined && typeof enabled !== 'boolean') return invalid('quiet_hours');
    if (start !== undefined && (typeof start !== 'string' || !HHMM.test(start))) return invalid('quiet_hours');
    if (end !== undefined && (typeof end !== 'string' || !HHMM.test(end))) return invalid('quiet_hours');
    if (typeof enabled === 'boolean') patch.quietEnabled = enabled;
    if (typeof start === 'string') patch.quietStart = start;
    if (typeof end === 'string') patch.quietEnd = end;
  }
  const digest = field(body, 'digest');
  if (digest !== undefined) {
    const time = field(digest, 'time');
    const only = field(digest, 'digest_only');
    if (time !== undefined && (typeof time !== 'string' || !HHMM.test(time))) return invalid('digest');
    if (only !== undefined && typeof only !== 'boolean') return invalid('digest');
    if (typeof time === 'string') patch.digestTime = time;
    if (typeof only === 'boolean') patch.digestOnly = only;
  }
  const types = field(body, 'event_types');
  if (types !== undefined) {
    if (typeof types !== 'object' || types === null || Array.isArray(types)) return invalid('event_types');
    const entries = Object.entries(types as Record<string, unknown>);
    if (!entries.every(([k, v]) => isEventTypeCode(k) && typeof v === 'boolean')) return invalid('event_types');
    patch.eventTypes = Object.fromEntries(entries) as Record<string, boolean>;
  }
  await updateAlertSettings(db, user.id, patch);
  return getAlertSettings(db, user);
}

// ---------------------------------------------------------------- history (PRD-003 §5.5)

export async function getAlertHistory(db: pg.ClientBase, params: URLSearchParams, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const raw = params.get('cursor');
  const before = raw === null ? null : decodeCursor(raw);
  if (raw !== null && before === null) return invalid('cursor');
  const limit = 50;
  const rows = await alertHistory(db, user.id, ENTITLEMENTS[user.tier].alertHistoryDays, before, limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    status: 200,
    body: {
      alerts: page.map((r) => ({
        alert_id: r.public_id,
        kind: r.kind,
        story_id: r.story_id,
        headline: r.headline,
        channels: r.channels,
        sent_at: r.sent_at,
        corrected: r.corrected,
        via: r.via,
      })),
      next_cursor: rows.length > limit && last ? encodeCursor(last.created_at, String(last.id)) : null,
    },
  };
}

// ---------------------------------------------------------------- push subscriptions

export async function postPushSubscription(db: pg.ClientBase, body: unknown, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const endpoint = field(body, 'endpoint');
  const keys = field(body, 'keys');
  const p256dh = field(keys, 'p256dh');
  const auth = field(keys, 'auth');
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2048) return invalid('endpoint');
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return invalid('keys');
  await savePushSubscription(db, user.id, endpoint, { p256dh, auth });
  return { status: 201, body: { endpoint } };
}

export async function deletePushSubscriptionApi(db: pg.ClientBase, body: unknown, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const endpoint = field(body, 'endpoint');
  if (typeof endpoint !== 'string') return invalid('endpoint');
  await deletePushSubscription(db, endpoint, user.id);
  return { status: 204, body: null };
}

// ---------------------------------------------------------------- one-click unsubscribe (US-003.6 AC-4)

// Works without signing in. GET only describes the action (link scanners prefetch GETs);
// POST — including RFC 8058 one-click from mail clients — performs it.
export async function unsubscribe(db: pg.ClientBase, method: string, params: URLSearchParams, authSecret: string): Promise<Res> {
  const token = params.get('token') ?? '';
  const userPublicId = verifyUnsubscribeToken(authSecret, token);
  if (!userPublicId) return { status: 404, body: { error: 'not_found' } };
  if (method === 'GET') return { status: 200, body: { action: 'unsubscribe_email_alerts', method: 'POST' } };
  await disableEmailAlerts(db, userPublicId);
  return { status: 200, body: { status: 'unsubscribed' } };
}

// ---------------------------------------------------------------- unread marker (PRD-001 §4.3)

const SEEN_VIEWS = new Set(['latest', 'watchlist', 'important', 'bullish', 'bearish', 'trending']);

export async function postStreamSeen(db: pg.ClientBase, body: unknown, user: SessionUser | null, now: Date): Promise<Res> {
  if (!user) return authRequired;
  const view = field(body, 'view');
  const at = field(body, 'last_seen_at');
  if (typeof view !== 'string' || !SEEN_VIEWS.has(view)) return invalid('view');
  const when = typeof at === 'string' ? new Date(at) : null;
  if (!when || Number.isNaN(when.getTime()) || when.getTime() > now.getTime() + 5 * 60_000) return invalid('last_seen_at');
  await markSeen(db, user.id, view, when);
  return { status: 204, body: null };
}
