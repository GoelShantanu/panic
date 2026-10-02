-- 0003_rule_tags_and_item_analysis.sql (Backend B3)
-- 1. tag_method 'rule': deterministic exact-name / curated-alias tags, the only article tags
--    shown before calibration data exists (entity-resolution.md §5). Confidence 1 by the
--    existing CHECK (method = 'model' OR confidence = 1).
-- 2. item_analysis: per-item classification and resolution, the input to story recomputation
--    on joins and merges (deduplication.md §5) and an audit record of what each item said.

BEGIN;
SET LOCAL timezone TO 'UTC';

ALTER TYPE tag_method ADD VALUE IF NOT EXISTS 'rule';

CREATE TABLE item_analysis (
  item_id           bigint PRIMARY KEY REFERENCES item (id),
  event_types       text[] NOT NULL CHECK (cardinality(event_types) BETWEEN 1 AND 3),
  tags              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
  unresolved        text[] NOT NULL DEFAULT '{}',
  numbers           text[] NOT NULL DEFAULT '{}',
  shingles          text[] NOT NULL DEFAULT '{}',
  rules_version     text NOT NULL,
  analysed_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON item_analysis TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0003_rule_tags_and_item_analysis');

COMMIT;
