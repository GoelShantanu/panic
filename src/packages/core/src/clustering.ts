// Clustering decisions (deduplication.md §3–4). When unsure, start a new story:
// a visible duplicate is better than hidden news (PRD-002 §4).

import type { EventTypeCode } from './event-types.ts';
import { jaccard, overlaps } from './text.ts';

export const CLUSTER_WINDOW_MS = 48 * 3600 * 1000;
export const ATTACH_WINDOW_MS = 24 * 3600 * 1000;
export const TWIN_WINDOW_MS = 30 * 60 * 1000;
export const TWIN_SUBJECT_SIMILARITY = 0.9;
export const WEIGHTS = { headline: 0.5, instruments: 0.3, eventType: 0.1, time: 0.1 } as const;

export interface ItemFeatures {
  readonly shingles: readonly string[];
  readonly numbers: readonly string[];
  readonly isins: readonly string[];
  readonly eventTypes: readonly EventTypeCode[];
  readonly at: Date;
}

export interface FilingFeatures extends ItemFeatures {
  readonly exchange: string;
  readonly subjectWords: readonly string[];
}

const specific = (types: readonly EventTypeCode[]) => types.filter((t) => t !== 'other');

// Pair score in [0, 1], or null when a veto applies.
export function pairScore(a: ItemFeatures, b: ItemFeatures): number | null {
  const dt = Math.abs(a.at.getTime() - b.at.getTime());
  if (dt > CLUSTER_WINDOW_MS) return null;
  if (a.isins.length > 0 && b.isins.length > 0 && !overlaps(a.isins, b.isins)) return null;
  if (a.numbers.length > 0 && b.numbers.length > 0 && !overlaps(a.numbers, b.numbers)) return null;
  const eventType = overlaps(specific(a.eventTypes), specific(b.eventTypes)) ? 1 : 0;
  const headlineSim = jaccard(a.shingles, b.shingles);
  const rest =
    WEIGHTS.headline * headlineSim + WEIGHTS.eventType * eventType + WEIGHTS.time * (1 - dt / CLUSTER_WINDOW_MS);
  // When neither item names a company (common at launch), or when near-identical syndicated headlines
  // have a company recognized on only one side (e.g. one publisher wire includes the ticker/mention or one
  // item was ingested before alias enrichment), treat the instrument signal as absent rather than negative.
  // When only one side has companies and the headlines are not near-identical, the missing overlap counts
  // against the pair to prevent general market headlines from merging into single-stock stories.
  if ((a.isins.length === 0 && b.isins.length === 0) || ((a.isins.length === 0 || b.isins.length === 0) && headlineSim >= 0.8)) {
    return rest / (1 - WEIGHTS.instruments);
  }
  const instruments = a.isins.length > 0 && b.isins.length > 0 ? jaccard(a.isins, b.isins) : 0;
  return rest + WEIGHTS.instruments * instruments;
}

// A story scores as its best item, but any item vetoing the newcomer vetoes the story.
export function storyScore(item: ItemFeatures, storyItems: readonly ItemFeatures[]): number | null {
  let best = 0;
  for (const s of storyItems) {
    const score = pairScore(item, s);
    if (score === null) return null;
    best = Math.max(best, score);
  }
  return storyItems.length > 0 ? best : null;
}

export interface Candidate<T> {
  readonly id: T;
  readonly items: readonly ItemFeatures[];
}

// S5: the best-scoring article story at or above the threshold.
export function bestArticleStory<T>(item: ItemFeatures, candidates: readonly Candidate<T>[], threshold: number): T | null {
  let best: { id: T; score: number } | null = null;
  for (const c of candidates) {
    const score = storyScore(item, c.items);
    if (score !== null && score >= threshold && (best === null || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

// S4: an article joins a filing's story when it shares an instrument and a specific event
// type, and appeared within 24 h after the filing.
export function attachScore(article: ItemFeatures, filing: ItemFeatures): number | null {
  const dt = article.at.getTime() - filing.at.getTime();
  if (dt < 0 || dt > ATTACH_WINDOW_MS) return null;
  if (!overlaps(article.isins, filing.isins)) return null;
  if (!overlaps(specific(article.eventTypes), specific(filing.eventTypes))) return null;
  return 0.5 + 0.3 + 0.2 * (1 - dt / ATTACH_WINDOW_MS);
}

// S2: the same announcement published on the other exchange.
export function isExchangeTwin(a: FilingFeatures, b: FilingFeatures): boolean {
  return (
    a.exchange !== b.exchange &&
    overlaps(a.isins, b.isins) &&
    Math.abs(a.at.getTime() - b.at.getTime()) <= TWIN_WINDOW_MS &&
    jaccard(a.subjectWords, b.subjectWords) >= TWIN_SUBJECT_SIMILARITY
  );
}

// S3 exception (PRD-002 US-002.3 AC-3): a filing joins an article-only story it explains:
// shared instrument and specific event type, all articles within 24 h before the filing.
export function filingExplainsStory(filing: ItemFeatures, storyItems: readonly ItemFeatures[]): boolean {
  if (storyItems.length === 0) return false;
  return storyItems.every((a) => {
    const lead = filing.at.getTime() - a.at.getTime();
    return (
      lead >= 0 &&
      lead <= ATTACH_WINDOW_MS &&
      overlaps(a.isins, filing.isins) &&
      overlaps(specific(a.eventTypes), specific(filing.eventTypes))
    );
  });
}
