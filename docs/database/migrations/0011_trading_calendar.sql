-- 0011_trading_calendar.sql (Backend B4b: PRD-001 US-001.3 AC-7, US-001.7; D-038)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Exchange trading holidays (NSE and BSE share one equity calendar). 'recurring' rows are the
-- fixed-date holidays added automatically for years whose official list is not yet entered.
CREATE TABLE market_holiday (
  holiday_date date PRIMARY KEY,
  name         text NOT NULL CHECK (name <> ''),
  source       text NOT NULL CHECK (source IN ('official', 'recurring'))
);

-- A year's recurring holidays are added once; removing one afterwards sticks.
CREATE TABLE calendar_year (
  year              integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2100),
  recurring_added_at timestamptz NOT NULL DEFAULT now()
);

-- Special sessions (Muhurat) and market-wide halts, laid over the generated day.
CREATE TABLE calendar_exception (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exchange_date date NOT NULL,
  session       session_type NOT NULL CHECK (session IN ('special', 'halted')),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  reason        text NOT NULL CHECK (reason <> ''),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (tstzrange(starts_at, ends_at) WITH &&)
);

-- Trending baselines read sessions by type over a trailing period.
CREATE INDEX trading_session_type_time ON trading_session (session, starts_at);

-- [VERIFIED: nseindia.com Equities holidays 2026, read 2026-10-03]
INSERT INTO market_holiday (holiday_date, name, source) VALUES
  ('2026-01-15', 'Municipal Corporation Election - Maharashtra', 'official'),
  ('2026-01-26', 'Republic Day', 'official'),
  ('2026-02-15', 'Mahashivratri', 'official'),
  ('2026-03-03', 'Holi', 'official'),
  ('2026-03-21', 'Id-Ul-Fitr (Ramadan Eid)', 'official'),
  ('2026-03-26', 'Shri Ram Navami', 'official'),
  ('2026-03-31', 'Shri Mahavir Jayanti', 'official'),
  ('2026-04-03', 'Good Friday', 'official'),
  ('2026-04-14', 'Dr. Baba Saheb Ambedkar Jayanti', 'official'),
  ('2026-05-01', 'Maharashtra Day', 'official'),
  ('2026-05-28', 'Bakri Id', 'official'),
  ('2026-06-26', 'Muharram', 'official'),
  ('2026-08-15', 'Independence Day', 'official'),
  ('2026-09-14', 'Ganesh Chaturthi', 'official'),
  ('2026-10-02', 'Mahatma Gandhi Jayanti', 'official'),
  ('2026-10-20', 'Dussehra', 'official'),
  ('2026-11-08', 'Diwali Laxmi Pujan', 'official'),
  ('2026-11-10', 'Diwali-Balipratipada', 'official'),
  ('2026-11-24', 'Prakash Gurpurb Sri Guru Nanak Dev', 'official'),
  ('2026-12-25', 'Christmas', 'official');
INSERT INTO calendar_year (year) VALUES (2026);
INSERT INTO calendar_exception (exchange_date, session, starts_at, ends_at, reason) VALUES
  ('2026-11-08', 'special', '2026-11-08 18:00+05:30', '2026-11-08 19:00+05:30', 'Muhurat trading');

GRANT SELECT, INSERT, UPDATE, DELETE ON market_holiday, calendar_year, calendar_exception TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0011_trading_calendar');

COMMIT;
