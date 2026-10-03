-- 0014_summary_reports.sql (Frontend F7: PRD-004 US-004.4 AC-5; D-046)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- A reader's report that a story's AI summary is inaccurate. One per reader per story; reviewed when
-- an operator hides, regenerates or dismisses (the action itself is in audit_log).
CREATE TABLE summary_report (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  story_id    bigint NOT NULL REFERENCES story (id),
  user_id     bigint NOT NULL REFERENCES app_user (id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (story_id, user_id),
  CHECK (reviewed_at IS NULL OR reviewed_at >= reported_at)
);
-- Q32: the operator queue reads unreviewed reports.
CREATE INDEX summary_report_open ON summary_report (story_id) WHERE reviewed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON summary_report TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0014_summary_reports');

COMMIT;
