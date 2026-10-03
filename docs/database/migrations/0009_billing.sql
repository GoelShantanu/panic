-- 0009_billing.sql (Backend B10: PRD-007 §2.2, D-035, D-036)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- A checkout started at the provider, before the subscription exists here. The provider's
-- subscription ID links the later webhooks back to the user.
CREATE TABLE billing_checkout (
  provider_ref text PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES app_user (id),
  plan         plan_id NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_checkout_user ON billing_checkout (user_id, created_at DESC);

-- Every provider webhook, once (the provider's event ID), kept for audit and replay.
CREATE TABLE billing_event (
  provider_event_id text PRIMARY KEY,
  event             text NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  provider_created  timestamptz,
  payload           jsonb NOT NULL,
  outcome           text
);

-- Plan switch at the next renewal (US-007.8 AC-3); ordering guard for out-of-order webhooks.
ALTER TABLE subscription ADD COLUMN pending_plan plan_id;
ALTER TABLE subscription ADD COLUMN last_event_at timestamptz;
ALTER TABLE subscription ADD COLUMN past_due_since timestamptz;

-- GST tax invoices: one number series per financial year, without gaps (D-036).
ALTER TABLE invoice ADD COLUMN invoice_number text UNIQUE;
ALTER TABLE invoice ADD COLUMN cgst_inr numeric(10,2);
ALTER TABLE invoice ADD COLUMN sgst_inr numeric(10,2);
ALTER TABLE invoice ADD COLUMN plan plan_id;
ALTER TABLE invoice ADD COLUMN period_end timestamptz;
ALTER TABLE invoice ADD CONSTRAINT invoice_gst_split CHECK (cgst_inr IS NULL OR cgst_inr + sgst_inr = gst_inr);
CREATE TABLE invoice_counter (
  financial_year text PRIMARY KEY CHECK (financial_year ~ '^[0-9]{4}-[0-9]{2}$'),
  last_number    integer NOT NULL CHECK (last_number >= 0)
);

-- In-app billing notices (PRD-007 §5: payment retrying, downgraded).
ALTER TABLE user_notice DROP CONSTRAINT user_notice_kind_check;
ALTER TABLE user_notice ADD CONSTRAINT user_notice_kind_check CHECK (kind IN (
  'comment_removed', 'comment_restored', 'commenting_suspended', 'voting_revoked', 'payment_retrying', 'downgraded'));

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_checkout, billing_event, invoice_counter TO stockpanic_app;

INSERT INTO schema_migrations (version) VALUES ('0009_billing');

COMMIT;
