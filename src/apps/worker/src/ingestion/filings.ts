// Filings adapter, vendor-neutral (ingestion.md §3, D-035). Poll sources read the envelope contract
// over HTTP; push sources arrive through the web receiver into raw_inbox; both end in upsertFiling.
//
// Poll contract (a vendor adapter or proxy serves it):
//   GET <url>?cursor=<opaque>          → { "announcements": [<envelope>…], "next_cursor": "…" | null }
//   GET <reconcile_url>?date=YYYY-MM-DD → { "announcements": [<envelope>…] }   (full list for the IST date)
// Envelope fields: exchange, announcement_id, scrip_code, subject, category, published_at (ISO 8601),
// url, attachment_url, status ("live" | "withdrawn").

import type pg from 'pg';
import { RECONCILIATION_ALERT_COVERAGE, nextFetchDelaySeconds, parseFilingEnvelope } from '@stockpanic/core';
import type { SessionType } from '@stockpanic/core';
import {
  filingLatency,
  filingsCursor,
  heldAnnouncements,
  markInboxProcessed,
  pendingInbox,
  recordFetch,
  recordReconciliation,
  setFilingsCursor,
  upsertFiling,
} from '@stockpanic/db';
import type { SourceRow, UpsertOutcome } from '@stockpanic/db';
import { conditionalGet } from './http.ts';
import type { FetchLike } from './http.ts';
import type { FetchSummary } from './run-source.ts';

const MAX_PAGES_PER_FETCH = 20;

function authHeaders(adapter: Record<string, unknown>, env: Record<string, string | undefined>): Record<string, string> {
  const name = adapter['token_env'];
  const token = typeof name === 'string' ? env[name] : undefined;
  return { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

function withParam(url: string, key: string, value: string | null): string {
  if (value === null) return url;
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

interface Tally {
  inserted: number;
  duplicates: number;
  revised: number;
  invalid: number;
  errors: string[];
}

async function ingestEnvelopes(db: pg.ClientBase, sourceId: string, list: unknown, now: Date, tally: Tally, backfill = false, onStored?: (outcome: UpsertOutcome, id: string) => void) {
  if (!Array.isArray(list)) throw new Error('announcements is not an array');
  for (const raw of list) {
    const e = parseFilingEnvelope(raw);
    if (!e.ok) {
      tally.invalid++;
      tally.errors.push(`invalid envelope (${e.error})`);
      continue;
    }
    const outcome = await upsertFiling(db, sourceId, e.value, now, { backfill });
    if (outcome === 'inserted') tally.inserted++;
    else if (outcome === 'duplicate') tally.duplicates++;
    else tally.revised++;
    onStored?.(outcome, e.value.announcementId);
  }
}

export interface FilingsDeps {
  fetchImpl?: FetchLike;
  env?: Record<string, string | undefined>;
  jitter?: () => number;
}

// One poll of a `filings_poll` source: follows next_cursor until caught up (bounded per pass).
export async function fetchFilingsOnce(db: pg.ClientBase, source: SourceRow, session: SessionType, now: Date, deps: FilingsDeps = {}): Promise<FetchSummary> {
  const url = source.adapter['url'];
  const tally: Tally = { inserted: 0, duplicates: 0, revised: 0, invalid: 0, errors: [] };
  let error: string | null = null;
  let retryAfter: number | null = null;
  if (typeof url !== 'string') error = 'adapter has no url';
  else {
    let cursor = await filingsCursor(db, source.sourceId);
    for (let page = 0; page < MAX_PAGES_PER_FETCH; page++) {
      const res = await conditionalGet(withParam(url, 'cursor', cursor), {
        etag: null,
        lastModified: null,
        headers: authHeaders(source.adapter, deps.env ?? process.env),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
      if (res.status === 'error') {
        error = res.message;
        retryAfter = res.retryAfterSeconds;
        break;
      }
      if (res.status === 'not_modified') break;
      let body: { announcements?: unknown; next_cursor?: unknown };
      try {
        body = JSON.parse(res.body);
        await ingestEnvelopes(db, source.sourceId, body.announcements, now, tally);
      } catch (err) {
        error = `bad response: ${(err as Error).message}`;
        break;
      }
      const next = typeof body.next_cursor === 'string' && body.next_cursor !== '' ? body.next_cursor : null;
      if (next === null || next === cursor) break;
      cursor = next;
      await setFilingsCursor(db, source.sourceId, cursor);
    }
  }
  const ok = error === null;
  const failures = ok ? 0 : source.health.consecutiveFailures + 1;
  const delay = nextFetchDelaySeconds(source.cadence.sessions[session].pollSeconds, failures, retryAfter) * (deps.jitter ?? (() => 1))();
  const nextFetchAt = new Date(now.getTime() + Math.round(delay * 1000));
  await recordFetch(db, source.sourceId, now, { ok, error, etag: null, lastModified: null, newItems: tally.inserted, nextFetchAt });
  return {
    sourceId: source.sourceId,
    outcome: !ok ? 'error' : tally.inserted > 0 ? 'new_items' : 'no_new_items',
    inserted: tally.inserted,
    duplicates: tally.duplicates + tally.revised,
    discardedNonEnglish: 0,
    discardedInvalid: tally.invalid,
    error,
    nextFetchAt,
  };
}

// Push deliveries waiting in raw_inbox. A payload is one envelope or { announcements: [...] }.
// An unreadable payload is marked processed with nothing stored; the raw row stays for audit.
export async function drainInbox(db: pg.ClientBase, now: Date, limit = 500): Promise<Tally & { payloads: number }> {
  const tally: Tally = { inserted: 0, duplicates: 0, revised: 0, invalid: 0, errors: [] };
  const rows = await pendingInbox(db, limit);
  const newBySource = new Map<string, number>();
  for (const row of rows) {
    const p = row.payload as Record<string, unknown> | null;
    const list = p && typeof p === 'object' && Array.isArray(p['announcements']) ? p['announcements'] : [p];
    const before = tally.inserted;
    try {
      await ingestEnvelopes(db, row.sourceId, list, now, tally);
    } catch (err) {
      tally.errors.push(`inbox ${row.id}: ${(err as Error).message}`);
    }
    await markInboxProcessed(db, row.id, now);
    newBySource.set(row.sourceId, (newBySource.get(row.sourceId) ?? 0) + tally.inserted - before);
  }
  // A push source is healthy while deliveries arrive (health is otherwise judged on silence).
  for (const [sourceId, n] of newBySource) {
    await recordFetch(db, sourceId, now, { ok: true, error: null, etag: null, lastModified: null, newItems: n, nextFetchAt: new Date(now.getTime() + 3600_000) });
  }
  return { ...tally, payloads: rows.length };
}

export interface ReconcileResult {
  sourceId: string;
  byExchange: { exchange: string; expected: number; ingested: number; backfilled: number; coverage: number; alert: boolean }[];
  error: string | null;
  latency: Awaited<ReturnType<typeof filingLatency>>;
}

// ingestion.md §3.1: compare the full list for an IST date with what was ingested; backfill the gaps.
export async function reconcileFilings(db: pg.ClientBase, source: SourceRow, istDate: string, now: Date, deps: FilingsDeps = {}): Promise<ReconcileResult> {
  const url = source.adapter['reconcile_url'];
  const empty = { sourceId: source.sourceId, byExchange: [], latency: [] };
  if (typeof url !== 'string') return { ...empty, error: 'adapter has no reconcile_url' };
  const res = await conditionalGet(withParam(url, 'date', istDate), {
    etag: null,
    lastModified: null,
    headers: authHeaders(source.adapter, deps.env ?? process.env),
    maxBytes: 50 * 1024 * 1024,
    timeoutMs: 120_000,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  if (res.status !== 'ok') return { ...empty, error: res.status === 'error' ? res.message : 'unexpected 304' };
  let list: unknown[];
  try {
    const body = JSON.parse(res.body);
    if (!Array.isArray(body.announcements)) throw new Error('announcements is not an array');
    list = body.announcements;
  } catch (err) {
    return { ...empty, error: `bad response: ${(err as Error).message}` };
  }

  const expectedByExchange = new Map<string, Set<string>>();
  for (const raw of list) {
    const e = parseFilingEnvelope(raw);
    if (!e.ok) continue;
    if (!expectedByExchange.has(e.value.exchange)) expectedByExchange.set(e.value.exchange, new Set());
    expectedByExchange.get(e.value.exchange)!.add(e.value.announcementId);
  }
  const heldBefore = new Map<string, Set<string>>();
  for (const ex of expectedByExchange.keys()) heldBefore.set(ex, await heldAnnouncements(db, ex, istDate));

  const tally: Tally = { inserted: 0, duplicates: 0, revised: 0, invalid: 0, errors: [] };
  const backfilled = new Map<string, number>();
  const missing = list.filter((raw) => {
    const e = parseFilingEnvelope(raw);
    return e.ok && !heldBefore.get(e.value.exchange)!.has(e.value.announcementId);
  });
  await ingestEnvelopes(db, source.sourceId, missing, now, tally, true, (outcome, id) => {
    if (outcome !== 'inserted') return;
    for (const [ex, ids] of expectedByExchange) if (ids.has(id)) backfilled.set(ex, (backfilled.get(ex) ?? 0) + 1);
  });

  const byExchange: ReconcileResult['byExchange'] = [];
  for (const [exchange, ids] of expectedByExchange) {
    const held = heldBefore.get(exchange)!;
    const ingested = [...ids].filter((id) => held.has(id)).length;
    const coverage = await recordReconciliation(db, { exchange, forDate: istDate, expected: ids.size, ingested, backfilled: backfilled.get(exchange) ?? 0, at: now });
    byExchange.push({ exchange, expected: ids.size, ingested, backfilled: backfilled.get(exchange) ?? 0, coverage, alert: coverage < RECONCILIATION_ALERT_COVERAGE });
  }
  return { sourceId: source.sourceId, byExchange, error: null, latency: await filingLatency(db, istDate) };
}
