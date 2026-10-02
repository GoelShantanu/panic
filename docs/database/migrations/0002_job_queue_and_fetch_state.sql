-- 0002_job_queue_and_fetch_state.sql
-- Job queue (ADR-004: Postgres-backed, SELECT … FOR UPDATE SKIP LOCKED) and per-source
-- fetch state for conditional requests (ingestion.md §4). Migration 0001 is frozen (D-028).

BEGIN;
SET LOCAL timezone TO 'UTC';

CREATE TABLE job (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue        text NOT NULL CHECK (queue ~ '^[a-z][a-z0-9_]*$'),
  priority     smallint NOT NULL DEFAULT 0,              -- higher runs first (system overview F9)
  payload      jsonb NOT NULL,
  run_after    timestamptz NOT NULL DEFAULT now(),
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at    timestamptz,
  CHECK (completed_at IS NULL OR failed_at IS NULL),
  CHECK ((locked_at IS NULL) = (locked_by IS NULL))
);
-- Q24: next runnable job per queue, highest priority, oldest first.
CREATE INDEX job_runnable ON job (queue, priority DESC, run_after, id)
  WHERE completed_at IS NULL AND failed_at IS NULL;
-- Q25: stuck-lock sweep.
CREATE INDEX job_locked ON job (locked_at) WHERE locked_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL;

CREATE TABLE source_fetch_state (
  source_id        text PRIMARY KEY REFERENCES source (source_id),
  etag             text,
  last_modified    text,
  cursor           text,
  next_fetch_at    timestamptz,
  last_new_item_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Fixed start of health tracking: "down" for a never-successful source is measured from here,
-- not from changed_at, which moves on every state change.
ALTER TABLE source_health ADD COLUMN tracking_since timestamptz NOT NULL DEFAULT now();

-- Adapter configuration, e.g. {"type": "rss", "url": "https://…/feed.xml"} (ingestion.md §2).
ALTER TABLE source ADD COLUMN adapter jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE source ADD CONSTRAINT source_enabled_has_adapter
  CHECK (NOT enabled OR (adapter ? 'type' AND jsonb_typeof(adapter -> 'type') = 'string'));

GRANT SELECT, INSERT, UPDATE, DELETE ON job, source_fetch_state TO stockpanic_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0002_job_queue_and_fetch_state');

COMMIT;
