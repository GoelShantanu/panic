import type pg from 'pg';
import { nextFetchDelaySeconds } from '@stockpanic/core';
import type { SessionType } from '@stockpanic/core';
import { recordFetch, storeCandidates } from '@stockpanic/db';
import type { SourceRow } from '@stockpanic/db';
import { conditionalGet } from './http.ts';
import type { FetchLike } from './http.ts';
import { FeedParseError, latestFeedPublication, parseFeed, toCandidates } from './rss.ts';
import { MONEYCONTROL_GOOGLE_MAX_ITEMS, moneycontrolGoogleEntries } from './google-news.ts';
import { MONEYCONTROL_MAX_ITEMS, moneycontrolMarketEntries } from './moneycontrol.ts';
import { ZEE_BUSINESS_MAX_ITEMS, zeeBusinessEntries } from './zee-business.ts';

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
  heldForReview: number;
  discardedIrrelevant: number;
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
    extras: { etag?: string | null; lastModified?: string | null; retryAfterSeconds?: number | null; latestPublishedAt?: Date | null } = {},
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
      ...(extras.latestPublishedAt !== undefined ? { latestPublishedAt: extras.latestPublishedAt } : {}),
    });
    return { sourceId: source.sourceId, nextFetchAt, ...partial };
  };

  const empty = { inserted: 0, duplicates: 0, discardedNonEnglish: 0, discardedInvalid: 0, heldForReview: 0, discardedIrrelevant: 0 };
  const url = source.adapter['url'];
  if (source.adapter['type'] !== 'rss' || typeof url !== 'string') {
    return finish({ outcome: 'error', error: `unsupported adapter: ${JSON.stringify(source.adapter)}`, ...empty });
  }

  const res = await conditionalGet(url, {
    ...(source.adapter['format'] === 'zee_business_markets' ? {
      headers: { 'user-agent': 'BazaarPanic RSS reader (+https://bazaarpanic.com/)' },
    } : {}),
    ...(source.adapter['format'] === 'moneycontrol_markets' ? {
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    } : {}),
    // Pre-upgrade validators cannot establish the age of content we have not inspected.
    etag: source.fetch.publicationObservedAt ? source.fetch.etag : null,
    lastModified: source.fetch.publicationObservedAt ? source.fetch.lastModified : null,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  if (res.status === 'not_modified') return finish({ outcome: 'not_modified', error: null, ...empty });
  if (res.status === 'error') {
    return finish({ outcome: 'error', error: res.message, ...empty }, { retryAfterSeconds: res.retryAfterSeconds });
  }

  let entries;
  let latestPublishedAt: Date | null;
  try {
    if (source.adapter['format'] === 'moneycontrol_markets') {
      const adapted = moneycontrolMarketEntries(res.body, url, now);
      entries = adapted.entries;
      latestPublishedAt = adapted.latestPublishedAt;
    } else {
      entries = parseFeed(res.body);
      if (source.adapter['format'] === 'moneycontrol_google_news') {
        const adapted = moneycontrolGoogleEntries(entries, url, now);
        entries = adapted.entries;
        latestPublishedAt = adapted.latestPublishedAt;
      } else if (source.adapter['format'] === 'zee_business_markets') {
        const adapted = zeeBusinessEntries(entries, url, now);
        entries = adapted.entries;
        latestPublishedAt = adapted.latestPublishedAt;
      } else latestPublishedAt = latestFeedPublication(entries, now);
    }
  } catch (err) {
    if (err instanceof FeedParseError) return finish({ outcome: 'error', error: err.message, ...empty });
    throw err;
  }
  const { candidates, discardedNonEnglish, discardedInvalid } = toCandidates(entries, source.articleScope);
  // Bound initial imports before persistence; unchanged polls cannot backfill older results.
  const limit = source.adapter['format'] === 'moneycontrol_google_news' ? MONEYCONTROL_GOOGLE_MAX_ITEMS
    : source.adapter['format'] === 'moneycontrol_markets' ? MONEYCONTROL_MAX_ITEMS
    : source.adapter['format'] === 'zee_business_markets' ? ZEE_BUSINESS_MAX_ITEMS : null;
  const selected = limit !== null
    ? candidates.filter(c => c.relevance?.decision === 'keep')
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0)).slice(0, limit)
    : candidates;
  const { inserted, duplicates, heldForReview, discardedIrrelevant } = await storeCandidates(db, source, selected);
  return finish(
    { outcome: inserted > 0 ? 'new_items' : 'no_new_items', error: null, inserted, duplicates, discardedNonEnglish, discardedInvalid, heldForReview, discardedIrrelevant },
    { etag: res.etag, lastModified: res.lastModified, latestPublishedAt },
  );
}
