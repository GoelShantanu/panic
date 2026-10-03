-- 0005_alert_delivery.sql (Backend B6, PRD-003)
-- Q26: alerts held for a user's digest (via = 'digest', not yet sent).
-- Q27: watchlist entries per user in recency order (tier limit after a downgrade, PRD-007 US-007.9).
-- Q28: push subscriptions per user.

BEGIN;
SET LOCAL timezone TO 'UTC';

CREATE INDEX alert_held_for_digest ON alert (user_id, created_at) WHERE via = 'digest' AND sent_at IS NULL;
CREATE INDEX watchlist_user_recent ON watchlist_entry (user_id, added_at DESC);
CREATE INDEX push_subscription_user ON push_subscription (user_id);

INSERT INTO schema_migrations (version) VALUES ('0005_alert_delivery');

COMMIT;
