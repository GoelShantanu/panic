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
  staleTier1Sources,
  storyDetailExtras,
  streamPage,
} from '@stockpanic/db';
import type { StoryCard, StreamView } from '@stockpanic/db';

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface Viewer {
  tier: Tier;
  userId: string | null;
}

// Anonymous until accounts exist (Backend B5); anonymous visitors get the free tier (PRD-007 §2.1).
export const ANONYMOUS: Viewer = { tier: 'free', userId: null };

const VIEWS = ['latest', 'watchlist', 'important', 'bullish', 'bearish', 'trending'] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const ok = (body: unknown, headers?: Record<string, string>): ApiResponse => (headers ? { status: 200, body, headers } : { status: 200, body });
const invalid = (param: string): ApiResponse => ({ status: 400, body: { error: 'invalid_param', param } });
const notFound = (): ApiResponse => ({ status: 404, body: { error: 'not_found' } });

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: at.toISOString(), i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    if (typeof v.t !== 'string' || typeof v.i !== 'string' || !/^\d+$/.test(v.i)) return null;
    const at = new Date(v.t);
    return Number.isNaN(at.getTime()) ? null : { at, id: v.i };
  } catch {
    return null;
  }
}

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

async function page(db: pg.ClientBase, view: StreamView, isin: string | null, p: ListParams, viewer: Viewer, now: Date) {
  const rows = await streamPage(db, {
    view,
    eventTypes: p.eventTypes,
    filingsOnly: p.filingsOnly,
    isin,
    before: p.before,
    notBefore: notBefore(viewer, now),
    limit: p.limit + 1,
  });
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
export async function getStream(db: pg.ClientBase, params: URLSearchParams, now: Date = new Date(), viewer: Viewer = ANONYMOUS): Promise<ApiResponse> {
  const view = params.get('view') ?? 'latest';
  if (!(VIEWS as readonly string[]).includes(view)) return invalid('view');
  const p = parseListParams(params, viewer, true);
  if (isResponse(p)) return p;

  if (view === 'watchlist' && viewer.userId === null) return { status: 401, body: { error: 'auth_required' } };
  if ((view === 'bullish' || view === 'bearish') && !(await directionalVotingEnabled(db))) return notFound(); // C-001.3
  if (view === 'trending' || view === 'watchlist') return notFound(); // Trending: Backend B4b; watchlist: B5–B6

  const { stories, next_cursor } = await page(db, view as StreamView, null, p, viewer, now);
  return ok({
    stories,
    next_cursor,
    session: await sessionInfo(db, now),
    stale_sources: await staleTier1Sources(db),
  });
}

// GET /v1/stories/{story_id} (PRD-004 §6.1)
export async function getStory(db: pg.ClientBase, publicId: string): Promise<ApiResponse> {
  const found = await lookupStory(db, publicId);
  if (found.kind === 'missing') return notFound();
  if (found.kind === 'merged') return { status: 301, body: { redirect: found.survivor }, headers: { location: `/v1/stories/${found.survivor}` } };

  const card = (await loadStoryCards(db, [found.id])).get(found.id);
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
): Promise<ApiResponse> {
  const inst = await knownInstrument(db, rawIsin);
  if (!inst) return notFound();
  const p = parseListParams(params, viewer, false);
  if (isResponse(p)) return p;
  const result = await page(db, 'latest', inst.isin, p, viewer, now);
  const cutoff = notBefore(viewer, now);
  return ok({
    stories: result.stories,
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

export async function route(db: pg.ClientBase, method: string, url: URL, now: Date = new Date()): Promise<ApiResponse> {
  if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } };
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1).map(decodeURIComponent);
  const [v1, resource, id, sub] = parts;
  if (v1 !== 'v1') return notFound();
  if (resource === 'stream' && parts.length === 2) return getStream(db, url.searchParams, now);
  if (resource === 'event-types' && parts.length === 2) return getEventTypes(db);
  if (resource === 'stories' && id && parts.length === 3) return getStory(db, id);
  if (resource === 'companies' && id && parts.length === 3) return getCompany(db, id, now);
  if (resource === 'companies' && id && sub === 'timeline' && parts.length === 4) return getCompanyTimeline(db, id, url.searchParams, now);
  if (resource === 'instruments' && id === 'search' && parts.length === 3) return getInstrumentSearch(db, url.searchParams);
  if (resource === 'instruments' && id && parts.length === 3) return getInstrument(db, id, url.searchParams);
  return notFound();
}
