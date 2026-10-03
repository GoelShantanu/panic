-- 0013_outbound_clicks.sql (Frontend F3: Product Definition §6.2 exit rate, PRD-004 US-004.2 AC-3; D-042)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- One row per outbound click on an item's source link. No user, session or IP: the metric is the
-- exit rate, not who left.
CREATE TABLE outbound_click (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id    bigint NOT NULL REFERENCES item (id),
  clicked_at timestamptz NOT NULL DEFAULT now(),
  surface    text NOT NULL CHECK (surface IN ('story', 'stream', 'other'))
);
CREATE INDEX outbound_click_item_time ON outbound_click (item_id, clicked_at DESC);

GRANT SELECT, INSERT ON outbound_click TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0013_outbound_clicks');

COMMIT;
