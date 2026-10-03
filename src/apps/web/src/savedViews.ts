// Saved views: a named view plus filters, one click to reopen (PRD-001 US-001.3 AC-2b; paid, up to 10,
// PRD-007 §2.1). On downgrade they are kept but disabled; re-subscribing restores them (US-007.9 AC-2).
import type pg from 'pg';
import { ENTITLEMENTS, isEventTypeCode, upgradeRequired } from '@stockpanic/core';
import { createSavedView, deleteSavedView, listSavedViews } from '@stockpanic/db';
import type { SessionUser } from '@stockpanic/db';

interface Res {
  status: number;
  body: unknown;
}
const VIEWS = ['latest', 'watchlist', 'important', 'bullish', 'bearish', 'trending'];
const authRequired: Res = { status: 401, body: { error: 'auth_required' } };
const invalid = (param: string): Res => ({ status: 400, body: { error: 'invalid_param', param } });

export async function getSavedViews(db: pg.ClientBase, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const limit = ENTITLEMENTS[user.tier].savedViews;
  return { status: 200, body: { views: await listSavedViews(db, user.id), limit, disabled: limit === 0 } };
}

export async function postSavedView(db: pg.ClientBase, body: unknown, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const name = typeof b['name'] === 'string' ? b['name'].trim() : '';
  if (name.length < 1 || name.length > 60) return invalid('name');
  const p = (typeof b['params'] === 'object' && b['params'] !== null ? b['params'] : null) as Record<string, unknown> | null;
  if (!p) return invalid('params');
  const view = p['view'] ?? 'latest';
  const eventTypes = p['event_types'] ?? [];
  const filingsOnly = p['filings_only'] ?? false;
  if (typeof view !== 'string' || !VIEWS.includes(view)) return invalid('params');
  if (!Array.isArray(eventTypes) || eventTypes.length > 20 || !eventTypes.every((t) => typeof t === 'string' && isEventTypeCode(t))) return invalid('params');
  if (typeof filingsOnly !== 'boolean') return invalid('params');
  const limit = ENTITLEMENTS[user.tier].savedViews;
  if (limit === 0) return { status: 402, body: upgradeRequired('saved_views') };
  const r = await createSavedView(db, user.id, name, { view, event_types: eventTypes, filings_only: filingsOnly }, limit);
  if (r.ok) return { status: 201, body: { id: r.id, name } };
  return r.error === 'limit' ? { status: 409, body: { error: 'saved_view_limit', limit } } : { status: 409, body: { error: 'name_taken' } };
}

export async function removeSavedView(db: pg.ClientBase, id: string, user: SessionUser | null): Promise<Res> {
  if (!user) return authRequired;
  return (await deleteSavedView(db, user.id, id)) ? { status: 204, body: null } : { status: 404, body: { error: 'not_found' } };
}
