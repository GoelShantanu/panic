-- 0024_comment_visible_index.sql
-- Partial index to accelerate story card comment counting (read.ts: loadStoryCards)

BEGIN;
SET LOCAL timezone TO 'UTC';

CREATE INDEX IF NOT EXISTS idx_comment_story_visible 
ON comment (story_id) 
WHERE state = 'visible';

INSERT INTO schema_migrations (version) VALUES ('0024_comment_visible_index');

COMMIT;
