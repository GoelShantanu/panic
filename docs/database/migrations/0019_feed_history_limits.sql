-- D-077: free 3 days, trial 10 days, paid 30 days of feed/company history.
-- Trials retain paid feature access; their distinct history window is derived at request time.
BEGIN;
UPDATE plan_entitlement SET history_days = CASE tier WHEN 'free' THEN 3 ELSE 30 END;
INSERT INTO schema_migrations (version) VALUES ('0019_feed_history_limits');
COMMIT;
