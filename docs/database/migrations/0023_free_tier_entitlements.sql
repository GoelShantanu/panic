-- 0023_free_tier_entitlements.sql
-- Synchronizes free tier plan entitlements to match 100% free platform policy (D-077, D-104)

BEGIN;
SET LOCAL timezone TO 'UTC';

UPDATE plan_entitlement
SET
  watchlist_limit = 200,
  alert_budget_ceiling = 25,
  default_alert_budget = 10,
  history_days = 30,
  alert_history_days = 365,
  multi_event_filter = true,
  stream_filings_only = true,
  saved_views = 10
WHERE tier = 'free';

INSERT INTO schema_migrations (version) VALUES ('0023_free_tier_entitlements');

COMMIT;
