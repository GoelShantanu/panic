-- 0007_ai_layer.sql (Backend B8: ai-layer.md, D-025, D-034)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Which classifier produced item_analysis.event_types, and the model's raw candidate scores (R4).
-- Raw scores are evaluation data only: no `model` tag is written until a calibration exists
-- (entity-resolution.md §5, D-034).
ALTER TABLE item_analysis ADD COLUMN classifier text NOT NULL DEFAULT 'rules' CHECK (classifier IN ('rules', 'model'));
ALTER TABLE item_analysis ADD COLUMN model_scores jsonb CHECK (model_scores IS NULL OR jsonb_typeof(model_scores) = 'array');

-- Spend reporting by IST month and day reads ai_call by time.
CREATE INDEX ai_call_job_time ON ai_call (job, called_at DESC);

INSERT INTO setting (key, value) VALUES
  ('ai_enabled',        'false'),                                                                    -- on once API credentials are configured
  ('ai_price_usd_mtok', '{"input": 1.0, "output": 5.0, "cache_read": 0.1, "cache_write": 1.25}'),   -- Haiku 4.5 list prices
  ('ai_usd_inr',        '84.0');                                                                     -- [ASSUMPTION] founder updates

INSERT INTO schema_migrations (version) VALUES ('0007_ai_layer');

COMMIT;
