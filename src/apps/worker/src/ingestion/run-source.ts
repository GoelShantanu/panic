import type pg from 'pg';
import { nextFetchDelaySeconds } from '@stockpanic/core';
import type { SessionType } from '@stockpanic/core';
import { recordFetch, storeCandidates } from '@stockpanic/db';
import type { SourceRow } from '@stockpanic/db';
import { conditionalGet } from './http.ts';
import type { FetchLike } from './http.ts';
import { FeedParseError, parseFeed, toCandidates } from './rss.ts';

export interface FetchDeps {
  fetchImpl?: FetchLike;
  // Multiplier applied to the delay; ±10% spreads feeds out (ingestion.md §4).
  jitter?: () => number;
}

export interface FetchSummary {
  sourceId: string;
  outcome: 'new_items' | 'no_new_items' | 'not_modified' | 'error';
  inserted: number;
  duplicates: number;
  discardedNonEnglish: number;
  discardedInvalid: number;
  error: string | null;
  nextFetchAt: Date;
}

const defaultJitter = () => 0.9 + Math.random() * 0.2;

export async function fetchSourceOnce(
  db: pg.ClientBase,
  source: SourceRow,
  session: SessionType,
  now: Date,
  deps: FetchDeps = {},
): Promise<FetchSummary> {
  const pollSeconds = source.cadence.sessions[session].pollSeconds;
  const jitter = deps.jitter ?? defaultJitter;

  const finish = async (
    partial: Omit<FetchSummary, 'sourceId' | 'nextFetchAt'>,
    extras: { etag?: string | null; lastModified?: string | null; retryAfterSeconds?: number | null } = {},
  ): Promise<FetchSummary> => {
    const ok = partial.outcome !== 'error';
    const failures = ok ? 0 : source.health.consecutiveFailures + 1;
    const delay = nextFetchDelaySeconds(pollSeconds, failures, extras.retryAfterSeconds ?? null) * jitter();
    const nextFetchAt = new Date(now.getTime() + Math.round(delay * 1000));
    await recordFetch(db, source.sourceId, now, {
      ok,
      error: partial.error,
      etag: extras.etag ?? null,
      lastModified: extras.lastModified ?? null,
      newItems: partial.inserted,
      nextFetchAt,
    });
    return { sourceId: source.sourceId, nextFetchAt, ...partial };
  };

  const empty = { inserted: 0, duplicates: 0, discardedNonEnglish: 0, discardedInvalid: 0 };
  const url = source.adapter['url'];
  if (source.adapter['type'] !== 'rss' || typeof url !== 'string') {
    return finish({ outcome: 'error', error: `unsupported adapter: ${JSON.stringify(source.adapter)}`, ...empty });
  }

  const res = await conditionalGet(url, {
    etag: source.fetch.etag,
    lastModified: source.fetch.lastModified,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  if (res.status === 'not_modified') return finish({ outcome: 'not_modified', error: null, ...empty });
  if (res.status === 'error') {
    return finish({ outcome: 'error', error: res.message, ...empty }, { retryAfterSeconds: res.retryAfterSeconds });
  }

  let entries;
  try {
    entries = parseFeed(res.body);
  } catch (err) {
    if (err instanceof FeedParseError) return finish({ outcome: 'error', error: err.message, ...empty });
    throw err;
  }
  const { candidates, discardedNonEnglish, discardedInvalid } = toCandidates(entries);
  const { inserted, duplicates } = await storeCandidates(db, source, candidates);
  return finish(
    { outcome: inserted > 0 ? 'new_items' : 'no_new_items', error: null, inserted, duplicates, discardedNonEnglish, discardedInvalid },
    { etag: res.etag, lastModified: res.lastModified },
  );
}
