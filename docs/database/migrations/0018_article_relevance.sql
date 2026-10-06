-- 0018_article_relevance.sql — market relevance gate and review queue.

BEGIN;
SET LOCAL timezone TO 'UTC';

ALTER TABLE source
  ADD COLUMN article_scope text NOT NULL DEFAULT 'general'
  CHECK (article_scope IN ('markets', 'business', 'general'));

CREATE TABLE article_relevance_candidate (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id           text NOT NULL REFERENCES source (source_id),
  dedup_key           text NOT NULL,
  headline            text NOT NULL,
  url                 text NOT NULL,
  published_at        timestamptz,
  excerpt             text,
  source_scope        text NOT NULL CHECK (source_scope IN ('markets', 'business', 'general')),
  rules_version       text NOT NULL,
  classification      text NOT NULL CHECK (classification IN ('keep', 'review', 'discard')),
  confidence          numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason              text NOT NULL,
  reviewed_decision   text CHECK (reviewed_decision IN ('keep', 'discard')),
  reviewed_at         timestamptz,
  reviewed_by         text,
  item_id             bigint REFERENCES item (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, dedup_key),
  CHECK ((reviewed_decision IS NULL) = (reviewed_at IS NULL)),
  CHECK (reviewed_decision IS NULL OR classification = 'review')
);

CREATE INDEX article_relevance_pending ON article_relevance_candidate (created_at, id)
  WHERE classification = 'review' AND reviewed_decision IS NULL;
CREATE INDEX article_relevance_source_recent ON article_relevance_candidate (source_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON article_relevance_candidate TO stockpanic_app;
GRANT USAGE, SELECT ON SEQUENCE article_relevance_candidate_id_seq TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0018_article_relevance');

COMMIT;
