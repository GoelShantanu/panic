import { describe, expect, it } from 'vitest';
import {
  BREAKER_MAX_DELAY_SECONDS,
  CadenceError,
  canonicalUrl,
  evaluateHealth,
  isProbablyEnglish,
  nextFetchDelaySeconds,
  normaliseHeadline,
  parseCadence,
} from './index.ts';
import type { HealthInput } from './index.ts';

const RSS_CADENCE = {
  pre_open: { poll_s: 60, expect: true },
  open: { poll_s: 60, expect: true },
  closed: { poll_s: 300, expect: true },
  holiday: { poll_s: 300, expect: false },
  special: { poll_s: 60, expect: true },
  halted: { poll_s: 60, expect: true },
  max_quiet_s: null,
};

describe('cadence', () => {
  it('parses the stored shape', () => {
    const c = parseCadence(RSS_CADENCE);
    expect(c.sessions.open).toEqual({ pollSeconds: 60, expectUpdates: true });
    expect(c.sessions.holiday.expectUpdates).toBe(false);
    expect(c.maxQuietSeconds).toBeNull();
  });

  it('rejects a missing session or bad values', () => {
    const { halted: _, ...missing } = RSS_CADENCE;
    expect(() => parseCadence(missing)).toThrow(CadenceError);
    expect(() => parseCadence({ ...RSS_CADENCE, open: { poll_s: 0, expect: true } })).toThrow(CadenceError);
    expect(() => parseCadence({ ...RSS_CADENCE, max_quiet_s: -5 })).toThrow(CadenceError);
  });
});

describe('source health (ingestion.md §5)', () => {
  const t0 = new Date('2026-10-05T04:00:00Z');
  const at = (s: number) => new Date(t0.getTime() + s * 1000);
  const base: HealthInput = {
    now: t0,
    session: { pollSeconds: 60, expectUpdates: true },
    maxQuietSeconds: null,
    lastSuccessAt: t0,
    lastNewItemAt: t0,
    trackingSince: t0,
    previous: 'healthy',
  };

  it('healthy within 3× cadence of the last success', () => {
    expect(evaluateHealth({ ...base, now: at(180) })).toBe('healthy');
  });

  it('stale beyond 3×, down beyond 10×', () => {
    expect(evaluateHealth({ ...base, now: at(181) })).toBe('stale');
    expect(evaluateHealth({ ...base, now: at(601) })).toBe('down');
  });

  it('a never-successful source is judged from when tracking began', () => {
    expect(evaluateHealth({ ...base, lastSuccessAt: null, now: at(601) })).toBe('down');
  });

  it('not evaluated in sessions where the source does not normally publish (M7)', () => {
    const holiday = { pollSeconds: 300, expectUpdates: false };
    expect(evaluateHealth({ ...base, session: holiday, now: at(100_000), previous: 'healthy' })).toBe('healthy');
    expect(evaluateHealth({ ...base, session: holiday, now: at(100_000), previous: 'down' })).toBe('down');
  });

  it('quiet rule is off by default and applies only when configured', () => {
    expect(evaluateHealth({ ...base, lastSuccessAt: at(9_000), now: at(9_000) })).toBe('healthy');
    expect(evaluateHealth({ ...base, maxQuietSeconds: 3_600, lastSuccessAt: at(9_000), now: at(9_000) })).toBe('stale');
  });
});

describe('fetch delay and circuit breaker', () => {
  it('normal delay is the poll interval', () => {
    expect(nextFetchDelaySeconds(60, 0, null)).toBe(60);
    expect(nextFetchDelaySeconds(60, 4, null)).toBe(60);
  });

  it('backs off exponentially from the 5th consecutive failure, capped at 15 min', () => {
    expect(nextFetchDelaySeconds(60, 5, null)).toBe(120);
    expect(nextFetchDelaySeconds(60, 6, null)).toBe(240);
    expect(nextFetchDelaySeconds(60, 20, null)).toBe(BREAKER_MAX_DELAY_SECONDS);
  });

  it('never fetches sooner than Retry-After, which is capped at 1 h', () => {
    expect(nextFetchDelaySeconds(60, 0, 600)).toBe(600);
    expect(nextFetchDelaySeconds(60, 0, 86_400)).toBe(3_600);
  });
});

describe('canonical URL', () => {
  it('strips tracking parameters and fragments', () => {
    expect(canonicalUrl('https://news.example.in/markets/story-1?utm_source=x&utm_medium=rss&id=7#top')).toBe(
      'https://news.example.in/markets/story-1?id=7',
    );
  });

  it('lower-cases the host and keeps meaningful parameters', () => {
    expect(canonicalUrl('https://News.Example.IN/a?page=2&fbclid=abc')).toBe('https://news.example.in/a?page=2');
  });

  it('rejects non-http(s) and malformed input', () => {
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalUrl('not a url')).toBeNull();
  });
});

describe('English-only check (N14)', () => {
  it('accepts English headlines, including with ₹ and numbers', () => {
    expect(isProbablyEnglish('Asterion Industries Q2 profit rises to ₹412 crore')).toBe(true);
  });

  it('rejects Devanagari and other Indic scripts', () => {
    expect(isProbablyEnglish('बाजार में तेजी, सेंसेक्स ऊपर')).toBe(false);
    expect(isProbablyEnglish('பங்குச் சந்தை உயர்வு')).toBe(false);
  });

  it('rejects text with no letters', () => {
    expect(isProbablyEnglish('12345 !!')).toBe(false);
  });

  it('normalises whitespace in headlines', () => {
    expect(normaliseHeadline('  Kestrel   Power\n wins order ')).toBe('Kestrel Power wins order');
  });
});
