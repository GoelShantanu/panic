import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_OPINION_LABEL,
  ENTITLEMENTS,
  EVENT_TYPES,
  SUMMARISABLE_EVENT_TYPES,
  isEventTypeCode,
  isPublicId,
  isinCheckDigit,
  newPublicId,
  parseIsin,
  upgradeRequired,
  voteDisplay,
} from './index.ts';

describe('ISIN (ADR-001)', () => {
  it('accepts real Indian ISINs with valid check digits', () => {
    expect(parseIsin('INE002A01018')).toBe('INE002A01018');
    expect(parseIsin('INE009A01021')).toBe('INE009A01021');
  });

  it('normalises case and whitespace', () => {
    expect(parseIsin(' ine002a01018 ')).toBe('INE002A01018');
  });

  it('rejects a wrong check digit', () => {
    expect(parseIsin('INE002A01019')).toBeNull();
  });

  it('rejects non-Indian and malformed values', () => {
    expect(parseIsin('US0378331005')).toBeNull();
    expect(parseIsin('INE002A0101')).toBeNull();
    expect(parseIsin('RELIANCE')).toBeNull();
  });

  it('computes the check digit from the first 11 characters', () => {
    expect(isinCheckDigit('INE002A0101')).toBe(8);
  });
});

describe('public IDs', () => {
  it('produces a 26-character Crockford ULID with the prefix', () => {
    const id = newPublicId('st');
    expect(isPublicId(id, 'st')).toBe(true);
    expect(isPublicId(id, 'it')).toBe(false);
  });

  it('sorts by creation time', () => {
    const zero = () => new Uint8Array(10);
    const earlier = newPublicId('it', 1_700_000_000_000, zero);
    const later = newPublicId('it', 1_700_000_000_001, zero);
    expect(earlier < later).toBe(true);
  });

  it('is deterministic given time and randomness', () => {
    const ff = (n: number) => new Uint8Array(n).fill(255);
    expect(newPublicId('al', 0, ff)).toBe('al_0000000000ZZZZZZZZZZZZZZZZ');
  });

  it('rejects timestamps outside the 48-bit range', () => {
    expect(() => newPublicId('us', -1)).toThrow(RangeError);
    expect(() => newPublicId('us', 2 ** 48)).toThrow(RangeError);
  });
});

describe('event taxonomy (PRD-004 §1)', () => {
  it('has 20 types, 13 alerting by default', () => {
    expect(EVENT_TYPES).toHaveLength(20);
    expect(EVENT_TYPES.filter((t) => t.alertDefault)).toHaveLength(13);
  });

  it('summarises only alert-default types (D-025)', () => {
    expect(SUMMARISABLE_EVENT_TYPES.has('results')).toBe(true);
    expect(SUMMARISABLE_EVENT_TYPES.has('trading_window')).toBe(false);
    expect(SUMMARISABLE_EVENT_TYPES.size).toBe(13);
  });

  it('recognises valid codes only', () => {
    expect(isEventTypeCode('pledge')).toBe(true);
    expect(isEventTypeCode('order_win')).toBe(false);
  });

  it('contains no tone or sentiment code (D-014)', () => {
    for (const t of EVENT_TYPES) expect(t.code).not.toMatch(/(^|_)(tone|sentiment)(_|$)/);
  });
});

describe('entitlements (PRD-007 §2.1)', () => {
  it('free history is 3 days; paid is 30 days (D-077)', () => {
    expect(ENTITLEMENTS.free.historyDays).toBe(3);
    expect(ENTITLEMENTS.paid.historyDays).toBe(30);
  });

  it('default budget never exceeds the ceiling', () => {
    for (const tier of ['free', 'paid'] as const) {
      expect(ENTITLEMENTS[tier].defaultAlertBudget).toBeLessThanOrEqual(ENTITLEMENTS[tier].alertBudgetCeiling);
    }
  });

  it('builds the standard 402 body', () => {
    expect(upgradeRequired('watchlist_limit')).toEqual({
      error: 'upgrade_required',
      feature: 'watchlist_limit',
      limit: 20,
      paid_value: 200,
    });
  });
});

describe('vote display (PRD-005 §3, §9.1)', () => {
  const counts = (bullish: number, bearish: number, neutral: number, important = 0) => ({ bullish, bearish, neutral, important });

  it('0 votes → none, no counts', () => {
    expect(voteDisplay(counts(0, 0, 0), { directionalEnabled: true }).directional).toEqual({
      state: 'none',
      label: COMMUNITY_OPINION_LABEL,
    });
  });

  it('1–2 votes → total only, no breakdown', () => {
    const d = voteDisplay(counts(1, 1, 0), { directionalEnabled: true }).directional;
    expect(d).toEqual({ state: 'few', total: 2, label: COMMUNITY_OPINION_LABEL });
  });

  it('≥ 3 votes → raw counts, uncapped (D-011)', () => {
    const d = voteDisplay(counts(6200, 1100, 0), { directionalEnabled: true }).directional;
    expect(d).toEqual({ state: 'counts', total: 7300, bullish: 6200, bearish: 1100, neutral: 0, label: COMMUNITY_OPINION_LABEL });
  });

  it('never contains percentage, ratio, score or consensus fields (C-005.2)', () => {
    const json = JSON.stringify(voteDisplay(counts(5, 3, 2, 4), { directionalEnabled: true }));
    expect(json).not.toMatch(/pct|percent|ratio|score|consensus/i);
  });

  it('kill switch off → no directional block, important count kept (US-005.7)', () => {
    const v = voteDisplay(counts(9, 9, 9, 4), { directionalEnabled: false });
    expect(v).toEqual({ important_count: 4 });
  });

  it('kill switch off → viewer cannot vote directionally and own vote hidden', () => {
    const v = voteDisplay(counts(1, 0, 0), {
      directionalEnabled: false,
      viewer: { mine: { directional: 'bullish', quality: [] }, canVote: { directional: true, quality: true, reason: null } },
    });
    expect(v.mine?.directional).toBeNull();
    expect(v.can_vote?.directional).toBe(false);
  });

  it('anonymous viewers get no mine/can_vote', () => {
    const v = voteDisplay(counts(3, 0, 0), { directionalEnabled: true });
    expect(v).not.toHaveProperty('mine');
    expect(v).not.toHaveProperty('can_vote');
  });
});
