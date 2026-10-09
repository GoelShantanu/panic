-- D-065: existing identities are preserved; passwords are optional until set by their owner.
BEGIN;

ALTER TABLE app_user
  ADD COLUMN first_name text CHECK (char_length(first_name) BETWEEN 1 AND 80),
  ADD COLUMN last_name text CHECK (char_length(last_name) BETWEEN 1 AND 80),
  ADD COLUMN password_hash text CHECK (password_hash ~ '^scrypt[$]32768[$]8[$]3[$][0-9a-f]{32}[$][0-9a-f]{128}$'),
  ADD COLUMN auth_version integer NOT NULL DEFAULT 0 CHECK (auth_version >= 0),
  ADD CONSTRAINT app_user_deleted_credentials CHECK
    (deleted_at IS NULL OR (first_name IS NULL AND last_name IS NULL AND password_hash IS NULL));

ALTER TABLE user_session ADD COLUMN auth_version integer NOT NULL DEFAULT 0;
ALTER TABLE pending_signup
  ADD COLUMN first_name text,
  ADD COLUMN last_name text,
  ADD COLUMN password_hash text;

-- Separate from email_code: recovery/verification codes cannot be consumed as login codes.
CREATE TABLE auth_challenge (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email citext NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('signup', 'reset', 'google')),
  code_hash text NOT NULL,
  user_id bigint REFERENCES app_user(id),
  first_name text,
  last_name text,
  password_hash text,
  google_sub text,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  used_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((purpose = 'signup' AND password_hash IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL AND user_id IS NULL AND google_sub IS NULL)
      OR (purpose = 'reset' AND user_id IS NOT NULL AND password_hash IS NULL AND google_sub IS NULL AND first_name IS NULL AND last_name IS NULL)
      OR (purpose = 'google' AND google_sub IS NOT NULL AND password_hash IS NULL))
);
CREATE INDEX auth_challenge_lookup ON auth_challenge(email, purpose, created_at DESC, id DESC);
CREATE INDEX auth_challenge_expiry ON auth_challenge(expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_challenge TO stockpanic_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO stockpanic_app;

INSERT INTO schema_migrations(version) VALUES ('0019_password_auth');
COMMIT;
