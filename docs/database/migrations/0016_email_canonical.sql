-- 0016_email_canonical.sql (Security review: one person, one account; abuse vector R6; D-053)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- Mirrors canonicalEmail() in packages/core/src/security.ts: "+tags" stripped; Gmail ignores dots and
-- googlemail.com is gmail.com. Keep the two identical.
CREATE FUNCTION email_canonical(e text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT CASE
    WHEN position('@' IN lower(btrim(e))) < 2 THEN lower(btrim(e))
    ELSE (
      SELECT CASE WHEN d IN ('gmail.com', 'googlemail.com') THEN replace(l, '.', '') || '@gmail.com' ELSE l || '@' || d END
        FROM (SELECT split_part(split_part(lower(btrim(e)), '@', 1), '+', 1) AS l,
                     substring(lower(btrim(e)) FROM '@([^@]*)$') AS d) x
    )
  END
$$;

-- An alias of an existing address cannot open a second account.
CREATE UNIQUE INDEX app_user_email_canonical ON app_user (email_canonical(email::text)) WHERE email IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('0016_email_canonical');

COMMIT;
