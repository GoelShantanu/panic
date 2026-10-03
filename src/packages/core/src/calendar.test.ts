import { describe, expect, it } from 'vitest';
import { buildDay, datesBetween, istInstant, isValidDate } from './calendar.ts';
import { TRENDING_BASELINE_FLOOR, expectedActivity, trendingScore, windowActivity } from './trending.ts';

const fmt = (ps: ReturnType<typeof buildDay>) =>
  ps.map((p) => `${new Date(p.startsAt.getTime() + 5.5 * 3600_000).toISOString().slice(11, 16)} ${p.session}`);

describe('trading calendar days (NSE/BSE equities)', () => {
  it('a trading weekday: closed, pre-open 09:00, open 09:15–15:30, closed', () => {
    expect(fmt(buildDay('2026-10-05', false))).toEqual(['00:00 closed', '09:00 pre_open', '09:15 open', '15:30 closed']);
  });
  it('weekends are closed; a weekday holiday is a holiday all day', () => {
    expect(fmt(buildDay('2026-10-03', false))).toEqual(['00:00 closed']);
    expect(fmt(buildDay('2026-10-02', true))).toEqual(['00:00 holiday']);
  });
  it('Muhurat on Sunday 8 November 2026, 18:00–19:00', () => {
    const d = buildDay('2026-11-08', true, [{ session: 'special', startsAt: istInstant('2026-11-08', '18:00'), endsAt: istInstant('2026-11-08', '19:00') }]);
    expect(fmt(d)).toEqual(['00:00 closed', '18:00 special', '19:00 closed']);
  });
  it('a halt cuts into the open session', () => {
    const d = buildDay('2026-10-05', false, [{ session: 'halted', startsAt: istInstant('2026-10-05', '11:00'), endsAt: istInstant('2026-10-05', '11:45') }]);
    expect(fmt(d)).toEqual(['00:00 closed', '09:00 pre_open', '09:15 open', '11:00 halted', '11:45 open', '15:30 closed']);
  });
  it('periods cover the day exactly, without gaps or overlaps', () => {
    const d = buildDay('2026-10-05', false, [{ session: 'halted', startsAt: istInstant('2026-10-05', '15:00'), endsAt: istInstant('2026-10-05', '16:00') }]);
    expect(d[0]!.startsAt).toEqual(istInstant('2026-10-05', '00:00'));
    expect(d.at(-1)!.endsAt).toEqual(istInstant('2026-10-06', '00:00'));
    for (let i = 1; i < d.length; i++) expect(d[i]!.startsAt).toEqual(d[i - 1]!.endsAt);
  });
  it('dates', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(datesBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('trending score (PRD-001 US-001.3 AC-7)', () => {
  it('distinct sources by tier; repeat items from one source count half', () => {
    expect(windowActivity({ itemCount: 4, sources: [{ sourceId: 'a', tier: 1 }, { sourceId: 'b', tier: 3 }, { sourceId: 'c', tier: 3 }, { sourceId: 'c', tier: 3 }] })).toEqual({ activity: 5.5, sourceCount: 3 });
  });
  it('normalises against the instrument’s own expected activity, with a floor', () => {
    expect(expectedActivity(0, 100)).toBe(TRENDING_BASELINE_FLOOR);
    expect(expectedActivity(50, 0)).toBe(TRENDING_BASELINE_FLOOR);
    expect(expectedActivity(500, 100)).toBe(10); // 5 per hour × 2-hour window
    expect(trendingScore(5, [1])).toBe(5);
    expect(trendingScore(5, [10, 1])).toBe(0.5); // the busiest instrument sets the bar
  });
});
