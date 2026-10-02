-- 0004_accounts.sql (Backend B5, PRD-007)
-- pending_signup: a verified identity (email code or Google) that has not yet chosen a username
--   and confirmed age/consent (PRD-007 US-007.1 AC-2). Holds no account; expires.
-- data_export: "Download my data" requests (PRD-007 US-007.3 AC-5).
-- app_user.deletion_comments: the user's choice for their comments on deletion (US-007.3 AC-3).

BEGIN;
SET LOCAL timezone TO 'UTC';

CREATE TABLE pending_signup (
  token_hash  text PRIMARY KEY,
  email       citext,
  google_sub  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  CHECK (email IS NOT NULL OR google_sub IS NOT NULL),
  CHECK (expires_at > created_at)
);
CREATE INDEX pending_signup_expiry ON pending_signup (expires_at);

CREATE TABLE data_export (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES app_user (id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  ready_at     timestamptz,
  expires_at   timestamptz,
  data         jsonb,
  CHECK ((ready_at IS NULL) = (data IS NULL)),
  CHECK (ready_at IS NULL OR expires_at > ready_at)
);
CREATE INDEX data_export_user ON data_export (user_id, requested_at DESC);

ALTER TABLE app_user ADD COLUMN deletion_comments text
  CHECK (deletion_comments IN ('keep_as_deleted_user', 'delete'));
ALTER TABLE app_user ADD CONSTRAINT app_user_deletion_choice
  CHECK (deletion_requested_at IS NULL OR deletion_comments IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON pending_signup, data_export TO stockpanic_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0004_accounts');

COMMIT;
