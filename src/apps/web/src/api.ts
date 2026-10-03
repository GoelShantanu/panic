// Framework-independent JSON API handlers (PRD-001 §4, PRD-002 §8.3, PRD-003 US-003.1, PRD-004 §6).
// Served today by server.ts; the Frontend phase's page framework calls the same handlers.

import type pg from 'pg';
import { ENTITLEMENTS, isEventTypeCode, parseIsin, upgradeRequired } from '@stockpanic/core';
import type { Tier } from '@stockpanic/core';
import {
  communityOpinion,
  companySlug,
  directionalVotingEnabled,
  eventTypeList,
  loadInstrument,
  loadStoryCards,
  lookupStory,
  olderStoriesExist,
  searchInstruments,
  sessionInfo,
  lastSeen,
  staleTier1Sources,
  storyDetailExtras,
  streamPage,
  streamUnreadCount,
} from '@stockpanic/db';
import type { SessionUser, StoryCard, StreamQuery, StreamView } from '@stockpanic/db';
import {
  getExportStatus,
  getMe,
  getPlans,
  patchMe,
  postDelete,
  postEmailStart,
  postEmailVerify,
  postExport,
  postGoogle,
  postSignout,
  postSignupComplete,
  postTrial,
  viewerFromToken,
} from './auth.ts';
import type { AuthDeps } from './auth.ts';
import { decodeCursor, encodeCursor } from './cursor.ts';
import {
  deletePushSubscriptionApi,
  deleteWatchlist,
  getAlertHistory,
  getAlertSettings,
  getWatchlist,
  postImportConfirm,
  postImportPreview,
  postPushSubscription,
  postStreamSeen,
  postWatchlist,
  putAlertSettings,
  unsubscribe,
} from './watchlist.ts';
import * as billing from './billing.ts';
import * as community from './community.ts';
import * as corrections from './corrections.ts';
import { currentSubscription } from '@stockpanic/db';

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface Viewer {
  tier: Tier;
  userId: string | null;
}

// Signed-out visitors get the free tier (PRD-007 §2.1).
export const ANONYMOUS: Viewer = { tier: 'free', userId: null };

const VIEWS = ['latest', 'watchlist', 'important', 'bullish', 'bearish', 'trending'] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const ok = (body: unknown, headers?: Record<string, string>): ApiResponse => (headers ? { status: 200, body, headers } : { status: 200, body });
const invalid = (param: string): ApiResponse => ({ status: 400, body: { error: 'invalid_param', param } });
const notFound = (): ApiResponse => ({ status: 404, body: { error: 'not_found' } });

export { decodeCursor, encodeCursor };

interface ListParams {
  limit: number;
  eventTypes: string[] | null;
  filingsOnly: boolean;
  before: { at: Date; id: string } | null;
}

// Shared validation for stream and timeline. `filingsOnlyIsPaid`: the stream toggle is paid;
// the company-page toggle is free (PRD-007 §2.1, PRD-004 US-004.3 AC-3).
function parseListParams(params: URLSearchParams, viewer: Viewer, filingsOnlyIsPaid: boolean): ListParams | ApiResponse {
  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return invalid('limit');

  const rawTypes = params.get('event_types');
  const eventTypes = rawTypes === null ? null : rawTypes.split(',').filter((t) => t !== '');
  if (eventTypes && (eventTypes.length === 0 || !eventTypes.every(isEventTypeCode))) return invalid('event_types');

  const rawFilings = params.get('filings_only');
  if (rawFilings !== null && rawFilings !== 'true' && rawFilings !== 'false') return invalid('filings_only');
  const filingsOnly = rawFilings === 'true';

  const rawCursor = params.get('cursor');
  const before = rawCursor === null ? null : decodeCursor(rawCursor);
  if (rawCursor !== null && before === null) return invalid('cursor');

  const ent = ENTITLEMENTS[viewer.tier];
  if (eventTypes && eventTypes.length > 1 && !ent.multiEventFilter) return { status: 402, body: upgradeRequired('multi_event_filter') };
  if (filingsOnly && filingsOnlyIsPaid && !ent.streamFilingsOnly) return { status: 402, body: upgradeRequired('stream_filings_only') };

  return { limit, eventTypes, filingsOnly, before };
}

const isResponse = (v: unknown): v is ApiResponse => typeof v === 'object' && v !== null && 'status' in v && 'body' in v;

function notBefore(viewer: Viewer, now: Date): Date | null {
  const days = ENTITLEMENTS[viewer.tier].historyDays;
  return days === null ? null : new Date(now.getTime() - days * 86_400_000);
}

function streamQuery(view: StreamView, isin: string | null, watchlistUserId: string | null, p: ListParams, viewer: Viewer, now: Date): StreamQuery {
  return { view, eventTypes: p.eventTypes, filingsOnly: p.filingsOnly, isin, watchlistUserId, before: p.before, notBefore: notBefore(viewer, now), limit: p.limit + 1 };
}

async function page(db: pg.ClientBase, view: StreamView, isin: string | null, p: ListParams, viewer: Viewer, now: Date, watchlistUserId: string | null = null) {
  const rows = await streamPage(db, streamQuery(view, isin, watchlistUserId, p, viewer, now));
  const pageRows = rows.slice(0, p.limit);
  const cards = await loadStoryCards(db, pageRows.map((r) => r.id));
  const last = pageRows[pageRows.length - 1];
  return {
    stories: pageRows.map((r) => cards.get(r.id)).filter((c): c is StoryCard => c !== undefined),
    next_cursor: rows.length > p.limit && last ? encodeCursor(last.firstSeenAt, last.id) : null,
    exhausted: rows.length <= p.limit,
  };
}

// GET /v1/stream (PRD-001 §4.1)
export async function getStream(db: pg.ClientBase, params: URLSearchParams, now: Date = new Date(), viewer: Viewer = ANONYMOUS, user: SessionUser | null = null): Promise<ApiResponse> {
  const view = params.get('view') ?? 'latest';
  if (!(VIEWS as readonly string[]).includes(view)) return invalid('view');
  const p = parseListParams(params, viewer, true);
  if (isResponse(p)) return p;

  if (view === 'watchlist' && viewer.userId === null) return { status: 401, body: { error: 'auth_required' } };
  if ((view === 'bullish' || view === 'bearish') && !(await directionalVotingEnabled(db))) return notFound(); // C-001.3
  if (view === 'trending') return notFound(); // Backend B4b: needs the trading calendar

  // The Watchlist view is Latest restricted to the viewer's instruments (PRD-001 US-001.3 AC-4).
  const baseView: StreamView = view === 'watchlist' ? 'latest' : (view as StreamView);
  const watchlistUserId = view === 'watchlist' ? viewer.userId : null;
  const result = await page(db, baseView, null, p, viewer, now, watchlistUserId);
  const stories = await community.personaliseVotes(db, result.stories, user, now);
  const next_cursor = result.next_cursor;

  // Unread marker for signed-in viewers (PRD-001 US-001.4); signed-out browsers keep their own.
  let unread: { is_unread: (s: StoryCard) => boolean; unread_count: number } | null = null;
  if (viewer.userId !== null) {
    const since = await lastSeen(db, viewer.userId, view);
    const count = since ? await streamUnreadCount(db, streamQuery(baseView, null, watchlistUserId, { ...p, before: null }, viewer, now), since) : 0;
    unread = { is_unread: (s) => since !== null && s.first_seen_at > since, unread_count: count };
  }
  return ok({
    stories: unread ? stories.map((s) => ({ ...s, is_unread: unread.is_unread(s) })) : stories,
    next_cursor,
    ...(unread ? { unread_count: unread.unread_count } : {}),
    session: await sessionInfo(db, now),
    stale_sources: await staleTier1Sources(db),
  });
}

// GET /v1/stories/{story_id} (PRD-004 §6.1)
export async function getStory(db: pg.ClientBase, publicId: string, user: SessionUser | null = null, now: Date = new Date()): Promise<ApiResponse> {
  const found = await lookupStory(db, publicId);
  if (found.kind === 'missing') return notFound();
  if (found.kind === 'merged') return { status: 301, body: { redirect: found.survivor }, headers: { location: `/v1/stories/${found.survivor}` } };

  const loaded = (await loadStoryCards(db, [found.id])).get(found.id);
  if (!loaded) return notFound();
  const [card] = await community.personaliseVotes(db, [loaded], user, now);
  if (!card) return notFound();
  const extras = await storyDetailExtras(db, found.id);
  return ok({
    story_id: card.story_id,
    headline: card.headline,
    first_seen_at: card.first_seen_at,
    updated_at: card.updated_at,
    event_types: card.event_types,
    instruments: card.instruments.map((i) => ({ ...i, name: extras.names.get(i.isin) ?? null })),
    unresolved_mentions: card.unresolved_mentions,
    summary: extras.summary,
    primary_item_id: extras.primary_item_id,
    items: extras.items,
    related: extras.related,
    votes: card.votes,
    comment_count: card.comment_count,
  });
}

async function knownInstrument(db: pg.ClientBase, raw: string) {
  const isin = parseIsin(raw);
  return isin ? loadInstrument(db, isin, null) : null;
}

// GET /v1/companies/{isin} (PRD-004 §6.2)
export async function getCompany(db: pg.ClientBase, rawIsin: string, now: Date = new Date()): Promise<ApiResponse> {
  const inst = await knownInstrument(db, rawIsin);
  if (!inst) return notFound();
  const body: Record<string, unknown> = {
    isin: inst.isin,
    name: inst.name,
    slug: companySlug(inst.name),
    display_symbol: inst.display_symbol,
    exchange_codes: inst.exchange_codes,
    segment: inst.segment,
    status: inst.status,
    successor_isin: inst.successor_isin,
  };
  if (await directionalVotingEnabled(db)) {
    body['community_opinion'] = {
      window_days: 7,
      label: `Community opinion on stories about ${inst.display_symbol ?? inst.name}, last 7 days`,
      display: await communityOpinion(db, inst.isin, now),
    };
  }
  return ok(body);
}

// GET /v1/companies/{isin}/timeline (PRD-004 §6.2)
export async function getCompanyTimeline(
  db: pg.ClientBase,
  rawIsin: string,
  params: URLSearchParams,
  now: Date = new Date(),
  viewer: Viewer = ANONYMOUS,
  user: SessionUser | null = null,
): Promise<ApiResponse> {
  const inst = await knownInstrument(db, rawIsin);
  if (!inst) return notFound();
  const p = parseListParams(params, viewer, false);
  if (isResponse(p)) return p;
  const result = await page(db, 'latest', inst.isin, p, viewer, now);
  const cutoff = notBefore(viewer, now);
  return ok({
    stories: await community.personaliseVotes(db, result.stories, user, now),
    next_cursor: result.next_cursor,
    depth_limit_reached: result.exhausted && cutoff !== null && (await olderStoriesExist(db, inst.isin, cutoff)),
  });
}

// GET /v1/instruments/{isin}?as_of= (PRD-002 §8.3)
export async function getInstrument(db: pg.ClientBase, rawIsin: string, params: URLSearchParams): Promise<ApiResponse> {
  const asOf = params.get('as_of');
  if (asOf !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)))) return invalid('as_of');
  const isin = parseIsin(rawIsin);
  const inst = isin ? await loadInstrument(db, isin, asOf) : null;
  return inst ? ok(inst) : notFound();
}

// GET /v1/instruments/search?q= (PRD-003 US-003.1 AC-1)
export async function getInstrumentSearch(db: pg.ClientBase, params: URLSearchParams): Promise<ApiResponse> {
  const q = (params.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 100) return invalid('q');
  return ok({ results: await searchInstruments(db, q) });
}

// GET /v1/event-types (PRD-004 §6.3)
export async function getEventTypes(db: pg.ClientBase): Promise<ApiResponse> {
  return ok(await eventTypeList(db));
}

export interface RequestCtx {
  body: unknown;
  sessionToken: string | null;
  ip?: string | null;
}

const NO_REQUEST: RequestCtx = { body: null, sessionToken: null };

export async function route(
  db: pg.ClientBase,
  method: string,
  url: URL,
  now: Date = new Date(),
  req: RequestCtx = NO_REQUEST,
  deps: AuthDeps | null = null,
): Promise<ApiResponse> {
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1).map(decodeURIComponent);
  const [v1, resource, id, sub] = parts;
  if (v1 !== 'v1') return notFound();
  const path = parts.slice(1).join('/');

  const user = await viewerFromToken(db, req.sessionToken, now);
  const viewer: Viewer = user ? { tier: user.tier, userId: user.id } : ANONYMOUS;

  if (method === 'POST' && resource === 'auth') {
    if (!deps) return { status: 503, body: { error: 'auth_unavailable' } };
    if (path === 'auth/email/start') return postEmailStart(db, req.body, deps, now);
    if (path === 'auth/email/verify') return postEmailVerify(db, req.body, deps, now);
    if (path === 'auth/google') return postGoogle(db, req.body, deps, now);
    if (path === 'auth/signup/complete') return postSignupComplete(db, req.body, req.sessionToken, now);
    if (path === 'auth/signout') return postSignout(db, req.body, req.sessionToken, user, now);
    if (path === 'auth/mfa') return community.postMfaVerify(db, req.body, user, deps.authSecret, now);
    return notFound();
  }
  if (path === 'me' && method === 'GET') return getMe(db, user);
  if (path === 'me' && method === 'PATCH') return patchMe(db, req.body, user, now);
  if (path === 'me/export' && method === 'POST') return postExport(db, user, now);
  if (resource === 'me' && id === 'export' && sub && parts.length === 4 && method === 'GET') return getExportStatus(db, user, sub, now);
  if (path === 'me/delete' && method === 'POST') {
    // Stop future charges at the provider too; access ends with the account (PRD-007 US-007.4).
    const sub = user && deps?.billing ? await currentSubscription(db, user.id, now) : null;
    if (sub && !sub.cancelAtPeriodEnd && sub.status !== 'cancelled') {
      await deps!.billing!.provider.cancelAtCycleEnd(sub.providerRef).catch((e: Error) => deps!.billing!.log?.(`cancel on deletion failed: ${e.message}`));
    }
    return postDelete(db, req.body, user, now);
  }
  if (path === 'billing/trial' && method === 'POST') return postTrial(db, user, now);
  const bill = deps?.billing ?? null;
  if (path === 'billing' && method === 'GET') return billing.getBilling(db, user, now);
  if (path === 'billing/checkout' && method === 'POST') return billing.postCheckout(db, req.body, user, bill, now);
  if (path === 'billing/cancel' && method === 'POST') return billing.postCancel(db, user, bill, now);
  if (path === 'billing/switch' && method === 'POST') return billing.postSwitch(db, req.body, user, bill, now);
  if (path === 'billing/invoices' && method === 'GET') return billing.getInvoices(db, user);
  if (resource === 'billing' && id === 'invoices' && sub && parts.length === 4 && method === 'GET') return billing.getInvoice(db, sub, user, bill);
  if (path === 'stream/seen' && method === 'POST') return postStreamSeen(db, req.body, user, now);
  if (path === 'watchlist' && method === 'GET') return getWatchlist(db, user);
  if (path === 'watchlist' && method === 'POST') return postWatchlist(db, req.body, user);
  if (path === 'watchlist/import/preview' && method === 'POST') return postImportPreview(db, req.body, user);
  if (path === 'watchlist/import/confirm' && method === 'POST') return postImportConfirm(db, req.body, user);
  if (resource === 'watchlist' && id && parts.length === 3 && method === 'DELETE') return deleteWatchlist(db, id, user);
  if (path === 'alerts/settings' && method === 'GET') return getAlertSettings(db, user);
  if (path === 'alerts/settings' && method === 'PUT') return putAlertSettings(db, req.body, user);
  if (path === 'alerts/history' && method === 'GET') return getAlertHistory(db, url.searchParams, user);
  if (path === 'alerts/unsubscribe' && (method === 'GET' || method === 'POST')) {
    return deps ? unsubscribe(db, method, url.searchParams, deps.authSecret) : { status: 503, body: { error: 'unavailable' } };
  }
  if (path === 'push/subscriptions' && method === 'POST') return postPushSubscription(db, req.body, user);
  if (path === 'push/subscriptions' && method === 'DELETE') return deletePushSubscriptionApi(db, req.body, user);

  // Votes (PRD-005 §9.2) and comments (PRD-006 §7).
  const ip = req.ip ?? null;
  if (resource === 'stories' && id && sub === 'votes') {
    const kind = parts[4];
    if (kind === 'directional' && parts.length === 5 && (method === 'PUT' || method === 'DELETE')) {
      return community.putDirectionalVote(db, id, req.body, user, ip, now, method === 'DELETE');
    }
    if (kind === 'quality' && parts[5] && parts.length === 6 && (method === 'PUT' || method === 'DELETE')) {
      return community.putQualityVote(db, id, parts[5], req.body, user, ip, now, method === 'DELETE');
    }
    return notFound();
  }
  if (resource === 'stories' && id && sub === 'comments' && parts.length === 4) {
    if (method === 'GET') return community.getComments(db, id, url.searchParams, user, now);
    if (method === 'POST') return community.postComment(db, id, req.body, user, now);
  }
  if (resource === 'comments' && id && parts.length === 3 && method === 'PATCH') return community.patchComment(db, id, req.body, user, now);
  if (resource === 'comments' && id && parts.length === 3 && method === 'DELETE') return community.deleteComment(db, id, user, now);
  if (resource === 'comments' && id && sub === 'reports' && parts.length === 4 && method === 'POST') return community.postReport(db, id, req.body, user, now);
  if (path === 'grievances' && method === 'POST') return community.postGrievance(db, req.body, now);
  if (path === 'me/replies' && method === 'GET') return community.getReplies(db, user, now);
  if (path === 'me/notifications' && method === 'GET') return community.getNotifications(db, user);
  if (resource === 'users' && id && parts.length === 3 && method === 'GET') return community.getProfile(db, id);
  if ((path === 'me/totp/enrol' || path === 'me/totp/confirm') && method === 'POST') {
    if (!deps) return { status: 503, body: { error: 'auth_unavailable' } };
    return path === 'me/totp/enrol' ? community.postTotpEnrol(db, user, deps.authSecret) : community.postTotpConfirm(db, req.body, user, deps.authSecret, now);
  }
  if (resource === 'admin') return adminRoute(db, method, parts, url, req.body, user, now);

  if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
  if (path === 'plans') return getPlans();
  if (resource === 'stream' && parts.length === 2) return getStream(db, url.searchParams, now, viewer, user);
  if (resource === 'event-types' && parts.length === 2) return getEventTypes(db);
  if (resource === 'stories' && id && parts.length === 3) return getStory(db, id, user, now);
  if (resource === 'companies' && id && parts.length === 3) return getCompany(db, id, now);
  if (resource === 'companies' && id && sub === 'timeline' && parts.length === 4) return getCompanyTimeline(db, id, url.searchParams, now, viewer, user);
  if (resource === 'instruments' && id === 'search' && parts.length === 3) return getInstrumentSearch(db, url.searchParams);
  if (resource === 'instruments' && id && parts.length === 3) return getInstrument(db, id, url.searchParams);
  return notFound();
}

// Operator endpoints: operator or admin role, plus an authenticator code within 12 h (PRD-007 US-007.5).
async function adminRoute(db: pg.ClientBase, method: string, parts: string[], url: URL, body: unknown, user: SessionUser | null, now: Date): Promise<ApiResponse> {
  const gate = community.operatorGate(user, now);
  if (gate) return gate;
  const op = user!;
  const [, , kind, id, action] = parts;
  const n = parts.length;
  if (kind === 'stories' && id && action === 'voters' && n === 5 && method === 'GET') return community.adminVoters(db, id, url.searchParams, op, now);
  if (kind === 'stories' && id && n === 5 && method === 'POST') {
    if (action === 'tags') return corrections.postRetag(db, id, body, op, now);
    if (action === 'merge') return corrections.postMerge(db, id, body, op, now);
    if (action === 'split') return corrections.postSplit(db, id, body, op, now);
  }
  if (kind === 'stories' && id && action === 'reports' && parts[5] === 'dismiss' && n === 6 && method === 'POST') return corrections.postDismiss(db, id, body, op, now);
  if (kind === 'corrections' && n === 3 && method === 'GET') return corrections.getCorrectionQueue(db);
  if (kind === 'comments' && id && action === 'takedown' && n === 5 && method === 'POST') return community.adminTakedown(db, id, body, op, now);
  if (kind === 'users' && id && n === 5 && method === 'POST') {
    if (action === 'comment-suspension') return community.adminUserRestriction(db, id, 'commenting', body, op, now);
    if (action === 'voting') return community.adminUserRestriction(db, id, 'voting', body, op, now);
    if (action === 'vote-discount') return community.adminUserRestriction(db, id, 'discount', body, op, now);
  }
  if (kind === 'settings' && id === 'comments' && n === 4 && method === 'PUT') return community.adminCommentSettings(db, body, op, now);
  if (kind === 'settings' && id === 'directional-voting' && n === 4 && method === 'PUT') return community.adminDirectionalSetting(db, body, op, now);
  if (kind === 'grievances' && n === 3 && method === 'GET') return community.adminGrievances(db, now);
  if (kind === 'grievances' && id && n === 4 && method === 'POST') return community.adminGrievanceUpdate(db, id, body, op, now);
  if (kind === 'abuse' && n === 3 && method === 'GET') return community.adminAbuse(db, now);
  return notFound();
}
