-- 0017_checkout_idempotency.sql — reuse a recent checkout on repeated requests.

BEGIN;
SET LOCAL timezone TO 'UTC';

ALTER TABLE billing_checkout ADD COLUMN short_url text;
CREATE INDEX billing_checkout_recent ON billing_checkout (user_id, created_at DESC) INCLUDE (provider_ref, plan, short_url);

INSERT INTO schema_migrations (version) VALUES ('0017_checkout_idempotency');

COMMIT;
