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

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
};
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;

// Publisher blurb from a feed description (PRD-002 US-002.5 AC-8; D-055): markup removed, entities
// decoded, cut at a word boundary. Stored and shown only for sources whose terms permit excerpts.
export const EXCERPT_MAX_CHARS = 650;
// The blurb needs only the start of a description; the rest of a 5 MB feed body is never scanned.
const EXCERPT_SCAN_CHARS = 20_000;
export function cleanExcerpt(raw: string | null, headline: string): string | null {
  if (!raw) return null;
  // Twice: markup that was itself escaped only appears after entities are decoded.
  const text = normaliseHeadline(stripTags(normaliseHeadline(stripTags(raw.slice(0, EXCERPT_SCAN_CHARS)))));
  if (text.length < 20 || text.toLowerCase() === headline.toLowerCase()) return null;
  if (text.length <= EXCERPT_MAX_CHARS) return text;
  const cut = text.slice(0, EXCERPT_MAX_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), EXCERPT_MAX_CHARS - 40)).replace(/[\s,;:.\-–]+$/, '')}…`;
}

// Tags (and script/style bodies) become spaces, in one pass. A regular expression here backtracks
// quadratically on an unclosed '<': one 160 KB description stalled ingestion for 88 s (D-058 S1).
export function stripTags(s: string): string {
  const lower = s.toLowerCase();
  const unclosed = new Set<string>(); // a body with no closing tag here has none further on either
  let out = '';
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) return out + s.slice(i);
    out += s.slice(i, lt);
    const body = /^<(script|style)\b/.exec(lower.slice(lt, lt + 8))?.[1];
    if (body && !unclosed.has(body)) {
      const close = lower.indexOf(`</${body}`, lt);
      const end = close === -1 ? -1 : s.indexOf('>', close);
      if (end !== -1) {
        out += ' ';
        i = end + 1;
        continue;
      }
      unclosed.add(body);
    }
    const gt = s.indexOf('>', lt);
    if (gt === -1) return out + s.slice(lt); // a literal '<' with no tag after it stays text
    out += ' ';
    i = gt + 1;
  }
  return out;
}

// Control and text-direction characters display as nothing, yet can make shown text read differently
// from what is stored (an override reverses "up" on screen). Zero-width characters ride along in
// feeds too. All are removed from text we display (D-058 S2).
const INVISIBLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
export function stripInvisible(s: string): string {
  return s.replace(INVISIBLE, '');
}

// Publishers often escape entities twice ('&amp;amp;', or '&amp;' inside CDATA), so the parsed title
// still contains them. Decoded, and invisible characters removed, before storage.
export function normaliseHeadline(raw: string): string {
  let s = raw;
  for (let i = 0; i < 2; i++) {
    s = s.replace(ENTITY, (m, e: string) => {
      if (e[0] !== '#') return NAMED_ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    });
  }
  return stripInvisible(s).replace(/\s+/g, ' ').trim();
}
