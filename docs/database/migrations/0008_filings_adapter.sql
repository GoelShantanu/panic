-- 0008_filings_adapter.sql (Backend B9: ingestion.md §3, D-035)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Poll adapters keep the vendor's opaque cursor in source_fetch_state.cursor (migration 0002).

-- Filings found by the daily reconciliation rather than the live feed (ingestion.md §3.1). They
-- are left out of the latency metric, and their stories take the original published time so a
-- day-old filing does not surface as new.
CREATE TABLE reconciliation_backfill (
  item_id       bigint PRIMARY KEY REFERENCES item (id),
  backfilled_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON reconciliation_backfill TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0008_filings_adapter');

COMMIT;
