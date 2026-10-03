-- 0010_story_corrections.sql (Backend B11: PRD-002 US-002.7, US-002.11; PRD-003 §3.4; D-037)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Operator tag decisions outlive recomputation: an added tag stays (story_tag method 'operator'),
-- a removed tag is never re-derived from the story's items.
CREATE TABLE story_tag_override (
  story_id    bigint NOT NULL REFERENCES story (id),
  isin        isin_code NOT NULL REFERENCES instrument (isin),
  action      text NOT NULL CHECK (action IN ('add', 'remove')),
  operator_id bigint NOT NULL REFERENCES app_user (id),
  reason      text NOT NULL CHECK (reason <> ''),
  decided_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, isin)
);

-- Confirmed corrections as labelled examples for resolver and clustering evaluation (US-002.11 AC-5).
CREATE TABLE correction_label (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('tag_added', 'tag_removed', 'merged', 'split', 'reports_dismissed')),
  story_id       bigint NOT NULL REFERENCES story (id),
  other_story_id bigint REFERENCES story (id),
  isin           isin_code REFERENCES instrument (isin),
  item_ids       bigint[],
  reason         text NOT NULL,
  operator_id    bigint NOT NULL REFERENCES app_user (id),
  labelled_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('tag_added', 'tag_removed')) = (isin IS NOT NULL)),
  CHECK (kind NOT IN ('merged', 'split') OR (other_story_id IS NOT NULL AND other_story_id <> story_id))
);
CREATE INDEX correction_label_time ON correction_label (labelled_at DESC);

-- Wrong-stock and duplicate reports cast after reviewed_through are still waiting (US-002.11 AC-2).
CREATE TABLE story_report_review (
  story_id         bigint NOT NULL REFERENCES story (id),
  kind             quality_vote NOT NULL CHECK (kind IN ('wrong_stock', 'duplicate')),
  reviewed_through timestamptz NOT NULL,
  PRIMARY KEY (story_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON story_tag_override, correction_label, story_report_review TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0010_story_corrections');

COMMIT;
