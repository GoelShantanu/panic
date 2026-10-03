-- 0006_votes_comments_moderation.sql (Backend B7: PRD-005, PRD-006, PRD-007 US-007.5)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Q29: per-user action rate limits (votes: PRD-005 US-005.1 AC-8) read the audit trail.
CREATE INDEX audit_log_actor_recent ON audit_log (actor_id, at DESC) WHERE actor_type = 'user';

-- Grievance and report references: GR-YYYY-NNNNNN (PRD-006 US-006.7 AC-3).
CREATE SEQUENCE grievance_reference_seq;

-- Per-story comment switches (PRD-006 US-006.6 AC-3). Absent row = follow the global settings.
CREATE TABLE story_comment_control (
  story_id        bigint PRIMARY KEY REFERENCES story (id),
  posting_enabled boolean NOT NULL DEFAULT true,
  visible         boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- In-app notices to a user: takedown of their comment (PRD-006 US-006.8 AC-5) and similar.
CREATE TABLE user_notice (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES app_user (id),
  kind       text NOT NULL CHECK (kind IN ('comment_removed', 'comment_restored', 'commenting_suspended', 'voting_revoked')),
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at    timestamptz
);
CREATE INDEX user_notice_unseen ON user_notice (user_id, created_at DESC) WHERE seen_at IS NULL;

-- Two-factor authentication for operator accounts (PRD-007 US-007.5 AC-2). The TOTP secret is
-- stored encrypted (AES-256-GCM, key derived from the server secret), never in clear.
ALTER TABLE app_user ADD COLUMN totp_secret_enc text;
ALTER TABLE app_user ADD CONSTRAINT app_user_totp_has_secret CHECK (NOT totp_enabled OR totp_secret_enc IS NOT NULL);
ALTER TABLE user_session ADD COLUMN mfa_verified_at timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON story_comment_control, user_notice TO stockpanic_app;
GRANT USAGE ON SEQUENCE grievance_reference_seq TO stockpanic_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0006_votes_comments_moderation');

COMMIT;
