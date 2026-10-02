// Ingestion rules shared by worker and tests (ingestion.md, PRD-001 US-001.6, PRD-002 US-002.5).

export const SESSION_TYPES = ['pre_open', 'open', 'closed', 'holiday', 'special', 'halted'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export type SourceKind = 'filing' | 'article' | 'regulator';
export type HealthState = 'healthy' | 'stale' | 'down';

export interface SessionCadence {
  readonly pollSeconds: number;
  // Whether health is evaluated in this session (system overview M7).
  readonly expectUpdates: boolean;
}

export interface Cadence {
  readonly sessions: Readonly<Record<SessionType, SessionCadence>>;
  // Optional "too quiet" rule: stale if no new item for this long in an expected session.
  readonly maxQuietSeconds: number | null;
}

export class CadenceError extends Error {}

// Wire shape stored in source.cadence:
// {"open": {"poll_s": 60, "expect": true}, …all six sessions…, "max_quiet_s": null}
export function parseCadence(value: unknown): Cadence {
  if (typeof value !== 'object' || value === null) throw new CadenceError('cadence must be an object');
  const raw = value as Record<string, unknown>;
  const sessions = {} as Record<SessionType, SessionCadence>;
  for (const session of SESSION_TYPES) {
    const entry = raw[session];
    if (typeof entry !== 'object' || entry === null) throw new CadenceError(`cadence.${session} missing`);
    const { poll_s, expect } = entry as Record<string, unknown>;
    if (typeof poll_s !== 'number' || !Number.isInteger(poll_s) || poll_s < 1) {
      throw new CadenceError(`cadence.${session}.poll_s must be a positive integer`);
    }
    if (typeof expect !== 'boolean') throw new CadenceError(`cadence.${session}.expect must be boolean`);
    sessions[session] = { pollSeconds: poll_s, expectUpdates: expect };
  }
  const quiet = raw['max_quiet_s'] ?? null;
  if (quiet !== null && (typeof quiet !== 'number' || !Number.isInteger(quiet) || quiet < 1)) {
    throw new CadenceError('cadence.max_quiet_s must be null or a positive integer');
  }
  return { sessions, maxQuietSeconds: quiet };
}

// ingestion.md §5
export const STALE_MULTIPLE = 3;
export const DOWN_MULTIPLE = 10;
export const BREAKER_THRESHOLD = 5;
export const BREAKER_MAX_DELAY_SECONDS = 15 * 60;
export const RETRY_AFTER_CAP_SECONDS = 60 * 60;

export interface HealthInput {
  readonly now: Date;
  readonly session: SessionCadence;
  readonly maxQuietSeconds: number | null;
  readonly lastSuccessAt: Date | null;
  readonly lastNewItemAt: Date | null;
  readonly trackingSince: Date; // when health tracking began for this source
  readonly previous: HealthState;
}

export function evaluateHealth(input: HealthInput): HealthState {
  if (!input.session.expectUpdates) return input.previous;
  const sinceSuccess = (input.now.getTime() - (input.lastSuccessAt ?? input.trackingSince).getTime()) / 1000;
  if (sinceSuccess > DOWN_MULTIPLE * input.session.pollSeconds) return 'down';
  if (sinceSuccess > STALE_MULTIPLE * input.session.pollSeconds) return 'stale';
  if (input.maxQuietSeconds !== null) {
    const quiet = (input.now.getTime() - (input.lastNewItemAt ?? input.trackingSince).getTime()) / 1000;
    if (quiet > input.maxQuietSeconds) return 'stale';
  }
  return 'healthy';
}

// Seconds until the next fetch: the session's poll interval, backing off exponentially
// after BREAKER_THRESHOLD consecutive failures, never sooner than a server's Retry-After.
export function nextFetchDelaySeconds(pollSeconds: number, consecutiveFailures: number, retryAfterSeconds: number | null): number {
  let delay = pollSeconds;
  if (consecutiveFailures >= BREAKER_THRESHOLD) {
    delay = Math.min(BREAKER_MAX_DELAY_SECONDS, pollSeconds * 2 ** (consecutiveFailures - BREAKER_THRESHOLD + 1));
  }
  if (retryAfterSeconds !== null) delay = Math.max(delay, Math.min(retryAfterSeconds, RETRY_AFTER_CAP_SECONDS));
  return delay;
}

// ingestion.md §4: canonical URL is the dedup key when a feed has no stable guid.
const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|dclid|mc_cid|mc_eid|_ga|ref|ref_src|cmpid|ito|src)$/i;

export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

// Product Definition N14 / PRD-002 US-002.5 AC-4: English-only at MVP. A headline is
// treated as English when at least 80% of its letters are Latin script. Romanised
// Hindi passes; that limitation is accepted at MVP.
export function isProbablyEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return false;
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length;
  return latin / letters.length >= 0.8;
}

export function normaliseHeadline(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
