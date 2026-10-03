-- 0015_article_tag_switch.sql (QA: PRD-002 US-002.8 AC-5 audit rule; D-051)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Article tags (resolver methods 'rule' and 'model') are shown only while this is true. A weekly
-- audit below 99.5% precision turns it off; filing tags (exchange code) and operator tags stay.
INSERT INTO setting (key, value) VALUES ('article_tags_enabled', 'true') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW story_tag_display AS
SELECT st.story_id, st.isin, st.method, st.confidence
FROM story_tag st
WHERE (st.method <> 'model'
       OR st.confidence >= (SELECT (value #>> '{}')::numeric FROM setting WHERE key = 'tag_display_threshold'))
  AND (st.method NOT IN ('rule', 'model')
       OR coalesce((SELECT (value #>> '{}')::boolean FROM setting WHERE key = 'article_tags_enabled'), true));

INSERT INTO schema_migrations (version) VALUES ('0015_article_tag_switch');

COMMIT;
