// Trading calendar storage and generation (PRD-001 US-001.7; D-038). trading_session rows are
// generated per IST day from holidays and exceptions; changing either rebuilds the affected days.

import type pg from 'pg';
import { RECURRING_HOLIDAYS, buildDay, datesBetween, istDate } from '@stockpanic/core';
import type { CalendarException } from '@stockpanic/core';
import { LIVE_CHANNEL } from './ingestion.ts';
import { sessionInfo } from './read.ts';

// Fixed-date holidays for a year, once (so an operator's removal is not undone).
async function ensureRecurring(db: pg.ClientBase, year: number): Promise<void> {
  const ins = await db.query('INSERT INTO calendar_year (year) VALUES ($1) ON CONFLICT DO NOTHING', [year]);
  if (!ins.rowCount) return;
  for (const h of RECURRING_HOLIDAYS) {
    await db.query(`INSERT INTO market_holiday (holiday_date, name, source) VALUES ($1, $2, 'recurring') ON CONFLICT DO NOTHING`, [`${year}-${h.monthDay}`, h.name]);
  }
}

async function writeDay(db: pg.ClientBase, date: string): Promise<void> {
  const holiday = (await db.query('SELECT 1 FROM market_holiday WHERE holiday_date = $1', [date])).rowCount! > 0;
  const ex = (await db.query('SELECT session, starts_at, ends_at FROM calendar_exception WHERE exchange_date = $1', [date])).rows;
  const exceptions: CalendarException[] = ex.map((r) => ({ session: r.session, startsAt: r.starts_at, endsAt: r.ends_at }));
  await db.query('DELETE FROM trading_session WHERE exchange_date = $1', [date]);
  for (const p of buildDay(date, holiday, exceptions)) {
    await db.query('INSERT INTO trading_session (exchange_date, session, starts_at, ends_at) VALUES ($1, $2, $3, $4)', [date, p.session, p.startsAt, p.endsAt]);
  }
}

// Generates any missing days in [from, to]. Days already generated are left alone.
export async function ensureCalendar(db: pg.ClientBase, from: string, to: string): Promise<number> {
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) await ensureRecurring(db, y);
  const have = new Set(
    (await db.query('SELECT DISTINCT exchange_date::text AS d FROM trading_session WHERE exchange_date BETWEEN $1 AND $2', [from, to])).rows.map((r) => r.d),
  );
  let made = 0;
  for (const d of datesBetween(from, to)) {
    if (have.has(d)) continue;
    await writeDay(db, d);
    made++;
  }
  return made;
}

async function inTx<T>(db: pg.ClientBase, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    const r = await fn();
    await db.query('COMMIT');
    return r;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

async function auditCalendar(db: pg.ClientBase, action: string, date: string, after: unknown, now: Date) {
  await db.query(`INSERT INTO audit_log (at, actor_type, actor_id, action, entity_type, entity_id, after) VALUES ($1, 'system', NULL, $2, 'calendar', $3, $4)`, [
    now,
    action,
    date,
    JSON.stringify(after),
  ]);
}

export async function addHoliday(db: pg.ClientBase, date: string, name: string, now: Date): Promise<void> {
  await inTx(db, async () => {
    await ensureRecurring(db, Number(date.slice(0, 4)));
    await db.query(
      `INSERT INTO market_holiday (holiday_date, name, source) VALUES ($1, $2, 'official')
       ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name, source = 'official'`,
      [date, name],
    );
    await writeDay(db, date);
    await auditCalendar(db, 'calendar.holiday_added', date, { name }, now);
  });
}

export async function removeHoliday(db: pg.ClientBase, date: string, now: Date): Promise<boolean> {
  return inTx(db, async () => {
    await ensureRecurring(db, Number(date.slice(0, 4)));
    const r = await db.query('DELETE FROM market_holiday WHERE holiday_date = $1', [date]);
    if (!r.rowCount) return false;
    await writeDay(db, date);
    await auditCalendar(db, 'calendar.holiday_removed', date, {}, now);
    return true;
  });
}

// Special sessions (Muhurat) and halts. A halt may be recorded while it is happening (US-001.7 AC-3).
export async function addCalendarException(db: pg.ClientBase, e: { date: string; session: 'special' | 'halted'; startsAt: Date; endsAt: Date; reason: string }, now: Date): Promise<void> {
  if (istDate(e.startsAt) !== e.date || istDate(new Date(e.endsAt.getTime() - 1)) !== e.date) throw new Error('an exception must fall within one IST day');
  await inTx(db, async () => {
    await db.query(`INSERT INTO calendar_exception (exchange_date, session, starts_at, ends_at, reason) VALUES ($1, $2, $3, $4, $5)`, [e.date, e.session, e.startsAt, e.endsAt, e.reason]);
    await writeDay(db, e.date);
    await auditCalendar(db, `calendar.${e.session}_added`, e.date, { starts_at: e.startsAt, ends_at: e.endsAt, reason: e.reason }, now);
  });
}

export async function clearCalendarExceptions(db: pg.ClientBase, date: string, now: Date): Promise<number> {
  return inTx(db, async () => {
    const r = await db.query('DELETE FROM calendar_exception WHERE exchange_date = $1', [date]);
    await writeDay(db, date);
    await auditCalendar(db, 'calendar.exceptions_cleared', date, { removed: r.rowCount }, now);
    return r.rowCount ?? 0;
  });
}

export async function calendarDay(db: pg.ClientBase, date: string) {
  const { rows } = await db.query('SELECT session, starts_at, ends_at FROM trading_session WHERE exchange_date = $1 ORDER BY starts_at', [date]);
  const h = (await db.query('SELECT name, source FROM market_holiday WHERE holiday_date = $1', [date])).rows[0];
  return { date, holiday: h ?? null, periods: rows };
}

// True when the year has no officially entered holidays (only the recurring fixed dates).
export async function officialListMissing(db: pg.ClientBase, year: number): Promise<boolean> {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM market_holiday WHERE source = 'official' AND extract(year FROM holiday_date) = $1`, [year]);
  return rows[0].n === 0;
}

// Broadcasts session.changed when the session state or exchange date differs from the last one
// broadcast (PRD-001 §4.2, US-001.7 AC-1/AC-3). Called on every ingestion tick.
export async function emitSessionIfChanged(db: pg.ClientBase, now: Date): Promise<boolean> {
  const info = await sessionInfo(db, now);
  const last = (await db.query(`SELECT payload FROM live_event WHERE type = 'session.changed' ORDER BY id DESC LIMIT 1`)).rows[0]?.payload;
  if (last && last.state === info.state && last.exchange_date === info.exchange_date) return false;
  const { rows } = await db.query(`INSERT INTO live_event (type, payload) VALUES ('session.changed', $1) RETURNING id`, [JSON.stringify(info)]);
  await db.query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, rows[0].id]);
  return true;
}
