-- 0021_pulse_refresh_usage_and_entitlements.sql
-- Updates plan alert limits: 3 for free, 25 for paid.
-- Adds pulse_refresh_usage table for tracking paid user refresh rate limits (4/min, 100/day).

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Update plan entitlements (free alert ceiling 3, paid alert ceiling 25)
UPDATE plan_entitlement SET alert_budget_ceiling = 3, default_alert_budget = 3 WHERE tier = 'free';
UPDATE plan_entitlement SET alert_budget_ceiling = 25 WHERE tier = 'paid';

-- Table for tracking manual telemetry refresh usage per user per IST day
CREATE TABLE IF NOT EXISTS pulse_refresh_usage (
  user_id      bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  day          date NOT NULL,
  daily_hits   integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  window_hits  integer NOT NULL DEFAULT 0,
  last_hit_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_pulse_refresh_usage_user ON pulse_refresh_usage (user_id);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockpanic_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pulse_refresh_usage TO stockpanic_app;
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('0021_pulse_refresh_usage_and_entitlements');

COMMIT;
