-- Fetch success and publisher content age are independent observations.
BEGIN;

ALTER TABLE source_fetch_state
  ADD COLUMN latest_published_at timestamptz,
  ADD COLUMN publication_observed_at timestamptz;

INSERT INTO schema_migrations(version) VALUES ('0020_feed_publication_freshness');
COMMIT;
