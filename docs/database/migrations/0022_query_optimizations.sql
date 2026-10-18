-- 0022_query_optimizations.sql
-- High-impact index optimizations:
-- 1. Partial index on article_relevance_candidate(item_id) for stream NOT EXISTS filter.
-- 2. Index on trading_session(starts_at) to avoid full scans on calendar range checks.
-- 3. Supporting indexes on high-churn foreign keys (lsh_band, alert, auth_challenge, story merged_into).

BEGIN;
SET LOCAL timezone TO 'UTC';

-- 1. Stream article relevance filter index (eliminates 3,600+ row table scan on every story query)
CREATE INDEX IF NOT EXISTS idx_article_relevance_discarded 
ON article_relevance_candidate (item_id) 
WHERE (coalesce(reviewed_decision, classification) = 'discard' AND item_id IS NOT NULL);

-- 2. Trading session starts_at index for calendar transition lookups
CREATE INDEX IF NOT EXISTS idx_trading_session_starts_at 
ON trading_session (starts_at);

-- 3. Foreign key supporting indexes to accelerate joins and avoid table locks on parent updates
CREATE INDEX IF NOT EXISTS idx_lsh_band_story_id 
ON lsh_band (story_id);

CREATE INDEX IF NOT EXISTS idx_alert_story_id 
ON alert (story_id);

CREATE INDEX IF NOT EXISTS idx_auth_challenge_user_id 
ON auth_challenge (user_id);

CREATE INDEX IF NOT EXISTS idx_story_merged_into 
ON story (merged_into) 
WHERE merged_into IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('0022_query_optimizations');

COMMIT;
