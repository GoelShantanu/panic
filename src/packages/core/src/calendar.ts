// NSE/BSE equity trading calendar (PRD-001 US-001.7; system overview M1, M2; D-038). Both exchanges
// share one calendar (founder, 2026-10-03). Session state is data: these rules generate the
// trading_session rows, and the exceptions recorded by operators override them.

import type { SessionType } from './ingestion.ts';

// Monday–Friday, IST [VERIFIED: NSE "Market Timings", 2026-10-03].
export const PRE_OPEN = { start: '09:00', end: '09:15' } as const;
export const REGULAR = { start: '09:15', end: '15:30' } as const;
export const MUHURAT_DEFAULT = { start: '18:00', end: '19:00' } as const; // founder, 2026-10-03

// Holidays on the same date every year. Lunar-calendar holidays move and are entered each year
// from the exchange's published list.
export const RECURRING_HOLIDAYS: readonly { monthDay: string; name: string }[] = [
  { monthDay: '01-26', name: 'Republic Day' },
  { monthDay: '04-14', name: 'Dr. Baba Saheb Ambedkar Jayanti' },
  { monthDay: '05-01', name: 'Maharashtra Day' },
  { monthDay: '08-15', name: 'Independence Day' },
  { monthDay: '10-02', name: 'Mahatma Gandhi Jayanti' },
  { monthDay: '12-25', name: 'Christmas' },
];

// [VERIFIED: nseindia.com/resources/exchange-communication-holidays, Equities 2026, read 2026-10-03.]
export const OFFICIAL_HOLIDAYS_2026: readonly { date: string; name: string }[] = [
  { date: '2026-01-15', name: 'Municipal Corporation Election - Maharashtra' },
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-02-15', name: 'Mahashivratri' },
  { date: '2026-03-03', name: 'Holi' },
  { date: '2026-03-21', name: 'Id-Ul-Fitr (Ramadan Eid)' },
  { date: '2026-03-26', name: 'Shri Ram Navami' },
  { date: '2026-03-31', name: 'Shri Mahavir Jayanti' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-14', name: 'Dr. Baba Saheb Ambedkar Jayanti' },
  { date: '2026-05-01', name: 'Maharashtra Day' },
  { date: '2026-05-28', name: 'Bakri Id' },
  { date: '2026-06-26', name: 'Muharram' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi' },
  { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-08', name: 'Diwali Laxmi Pujan' },
  { date: '2026-11-10', name: 'Diwali-Balipratipada' },
  { date: '2026-11-24', name: 'Prakash Gurpurb Sri Guru Nanak Dev' },
  { date: '2026-12-25', name: 'Christmas' },
];
export const MUHURAT_2026 = { date: '2026-11-08', ...MUHURAT_DEFAULT };

export interface Period {
  session: SessionType;
  startsAt: Date;
  endsAt: Date;
}

export interface CalendarException {
  session: 'special' | 'halted';
  startsAt: Date;
  endsAt: Date;
}

export const istInstant = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
const nextDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

// One IST calendar day as contiguous periods covering [00:00, 24:00). Exceptions (Muhurat, halts)
// are laid over the base day.
export function buildDay(date: string, holiday: boolean, exceptions: readonly CalendarException[] = []): Period[] {
  const dayStart = istInstant(date, '00:00');
  const dayEnd = istInstant(nextDate(date), '00:00');
  const wd = weekday(date);
  let periods: Period[];
  if (wd === 0 || wd === 6) periods = [{ session: 'closed', startsAt: dayStart, endsAt: dayEnd }];
  else if (holiday) periods = [{ session: 'holiday', startsAt: dayStart, endsAt: dayEnd }];
  else {
    periods = [
      { session: 'closed', startsAt: dayStart, endsAt: istInstant(date, PRE_OPEN.start) },
      { session: 'pre_open', startsAt: istInstant(date, PRE_OPEN.start), endsAt: istInstant(date, PRE_OPEN.end) },
      { session: 'open', startsAt: istInstant(date, REGULAR.start), endsAt: istInstant(date, REGULAR.end) },
      { session: 'closed', startsAt: istInstant(date, REGULAR.end), endsAt: dayEnd },
    ];
  }
  for (const ex of [...exceptions].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const s = new Date(Math.max(ex.startsAt.getTime(), dayStart.getTime()));
    const e = new Date(Math.min(ex.endsAt.getTime(), dayEnd.getTime()));
    if (s >= e) continue;
    const next: Period[] = [];
    for (const p of periods) {
      if (p.endsAt <= s || p.startsAt >= e) {
        next.push(p);
        continue;
      }
      if (p.startsAt < s) next.push({ ...p, endsAt: s });
      if (p.endsAt > e) next.push({ ...p, startsAt: e });
    }
    next.push({ session: ex.session, startsAt: s, endsAt: e });
    periods = next.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
  return periods;
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDate(d)) out.push(d);
  return out;
}

export const istDate = (at: Date) => new Date(at.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
