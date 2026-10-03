-- 0001_constraints_test.sql — proves the constraints in 0001_initial.sql hold.
-- Run against a throwaway database after applying all migrations (see the erratum at the fixture), as a superuser:
--   psql -v ON_ERROR_STOP=1 -f 0001_constraints_test.sql
-- Every test prints "PASS <name>". Any failure stops the run with "FAIL <name>".

\set ON_ERROR_STOP on
SET client_min_messages TO notice;

CREATE FUNCTION pg_temp.expect_error(p_label text, p_stmt text, p_pattern text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_stmt;   -- tests of deferred constraints end with SET CONSTRAINTS ALL IMMEDIATE
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* p_pattern OR SQLSTATE = p_pattern THEN
      RAISE NOTICE 'PASS %', p_label;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL % — unexpected error: % (%)', p_label, SQLERRM, SQLSTATE;
  END;
  RAISE EXCEPTION 'FAIL % — statement succeeded: %', p_label, p_stmt;
END $$;

CREATE FUNCTION pg_temp.expect_true(p_label text, p_cond boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE 'PASS %', p_label;
  ELSE RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
BEGIN;
INSERT INTO instrument (isin, segment) VALUES ('INE000A01011', 'mainboard'), ('INE000B01012', 'sme');
INSERT INTO instrument_code (isin, exchange, code, valid) VALUES
  ('INE000A01011', 'NSE', 'OLDCO', '[2020-01-01,2026-06-01)'),
  ('INE000A01011', 'NSE', 'NEWCO', '[2026-06-01,)'),
  ('INE000A01011', 'BSE', '500001', '[2020-01-01,)'),
  ('INE000B01012', 'NSE', 'BETA',  '[2021-01-01,)');
-- Erratum (Backend exit review, D-039): from migration 0002 an enabled source must declare an
-- adapter; the fixture sets one so this file runs against the current schema. Under 0001 alone the
-- column does not exist: run it against the full migration set (npm run db:migrate).
INSERT INTO source (source_id, name, kind, tier, access_basis, access_checked_on, enabled, cadence, adapter)
VALUES ('src_bse_ann', 'BSE Announcements', 'filing', 1, 'licence:TEST', '2026-10-01', true, '{}', '{"type": "test"}'),
       ('src_pub_a',   'Publisher A',       'article', 3, 'https://example.invalid/terms', '2026-10-01', true, '{}', '{"type": "test"}');
INSERT INTO item (id, public_id, kind, source_id, dedup_key, headline, url) OVERRIDING SYSTEM VALUE VALUES
  (1, 'it_01J9Z3M4R7ABCDEFGHJKMNPQRS', 'filing',  'src_bse_ann', 'BSE:1', 'Outcome of Board Meeting', 'https://example.invalid/1'),
  (2, 'it_01J9Z3M4R7ABCDEFGHJKMNPQRT', 'article', 'src_pub_a',   'u:2',   'Company A declares dividend', 'https://example.invalid/2'),
  (3, 'it_01J9Z3M4R7ABCDEFGHJKMNPQRV', 'article', 'src_pub_a',   'u:3',   'Unrelated headline', 'https://example.invalid/3'),
  (4, 'it_01J9Z3M4R7ABCDEFGHJKMNPQRW', 'article', 'src_pub_a',   'u:4',   'Fourth headline', 'https://example.invalid/4'),
  (5, 'it_01J9Z3M4R7ABCDEFGHJKMNPQRX', 'article', 'src_pub_a',   'u:5',   'Fifth headline', 'https://example.invalid/5');
INSERT INTO filing_detail (item_id, exchange, announcement_id, scrip_code) VALUES (1, 'BSE', '1', '500001');
INSERT INTO story (id, public_id, first_seen_at, primary_item_id) OVERRIDING SYSTEM VALUE VALUES
  (1, 'st_01J9Z3K8Q2ABCDEFGHJKMNPQRS', now(), 1),
  (2, 'st_01J9Z3K8Q2ABCDEFGHJKMNPQRT', now(), 3);
INSERT INTO story_item (item_id, story_id) VALUES (1, 1), (2, 1), (3, 2);
INSERT INTO story_event_type (story_id, code, source) VALUES (1, 'board_outcome', 'rule'), (2, 'other', 'rule');
INSERT INTO story_tag (story_id, isin, method, confidence) VALUES (1, 'INE000A01011', 'exchange_code', 1);
INSERT INTO app_user (id, public_id, username, email, email_verified_at, age_confirmed_at, terms_accepted_at, privacy_consent_at)
  OVERRIDING SYSTEM VALUE VALUES
  (1, 'us_01J9Z3K8Q2ABCDEFGHJKMNPQRS', 'trader_a', 'a@example.invalid', now(), now(), now(), now()),
  (2, 'us_01J9Z3K8Q2ABCDEFGHJKMNPQRT', 'trader_b', 'b@example.invalid', now(), now(), now(), now());
COMMIT;

-- ---------------------------------------------------------------------
-- GUARDRAILS §4.1 / ADR-001 — ISIN identity
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('isin_format',
  $$INSERT INTO instrument (isin, segment) VALUES ('US0378331005', 'mainboard')$$, 'isin_code');
SELECT pg_temp.expect_error('story_tag_requires_known_isin',
  $$INSERT INTO story_tag (story_id, isin, method, confidence) VALUES (1, 'INE999Z01019', 'operator', 1)$$, '23503');

-- GUARDRAILS §4.2 — temporal mappings, no overlaps
SELECT pg_temp.expect_error('code_cannot_map_to_two_instruments',
  $$INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ('INE000B01012', 'NSE', 'NEWCO', '[2026-07-01,)')$$, '23P01');
SELECT pg_temp.expect_error('instrument_one_code_per_exchange_at_a_time',
  $$INSERT INTO instrument_code (isin, exchange, code, valid) VALUES ('INE000A01011', 'NSE', 'THIRD', '[2026-08-01,)')$$, '23P01');
SELECT pg_temp.expect_true('as_of_lookup_returns_old_symbol',
  (SELECT code FROM instrument_code WHERE isin = 'INE000A01011' AND exchange = 'NSE' AND valid @> date '2025-03-01') = 'OLDCO');
SELECT pg_temp.expect_true('as_of_lookup_returns_new_symbol',
  (SELECT code FROM instrument_code WHERE isin = 'INE000A01011' AND exchange = 'NSE' AND valid @> date '2026-09-01') = 'NEWCO');

-- ---------------------------------------------------------------------
-- GUARDRAILS §4.3 / D-014 — no AI tone storage
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('no_tone_column_on_new_table',
  $$CREATE TABLE t_bad (id int, ai_tone text)$$, 'GUARDRAILS 4.3');
SELECT pg_temp.expect_error('no_sentiment_column_added_later',
  $$ALTER TABLE story ADD COLUMN sentiment_score numeric$$, 'GUARDRAILS 4.3');
SELECT pg_temp.expect_error('no_sentiment_table',
  $$CREATE TABLE story_sentiment (id int)$$, 'GUARDRAILS 4.3');
SELECT pg_temp.expect_error('no_tone_view',
  $$CREATE VIEW v_tone AS SELECT 1 AS x$$, 'GUARDRAILS 4.3');
CREATE TABLE t_ok_milestone (milestone text);   -- whole-word match only: must succeed
DROP TABLE t_ok_milestone;
SELECT pg_temp.expect_true('milestone_column_allowed', true);

-- ---------------------------------------------------------------------
-- Sources and items — PRD-002
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('source_enabled_needs_access_basis',
  $$INSERT INTO source (source_id, name, kind, tier, enabled, cadence) VALUES ('src_x', 'X', 'article', 4, true, '{}')$$, '23514');
SELECT pg_temp.expect_error('filing_source_is_tier_1',
  $$INSERT INTO source (source_id, name, kind, tier, cadence) VALUES ('src_y', 'Y', 'filing', 3, '{}')$$, '23514');
SELECT pg_temp.expect_error('item_dedup_unique',
  $$INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url)
    VALUES ('it_01J9Z3M4R7ABCDEFGHJKMNPQRW', 'article', 'src_pub_a', 'u:2', 'dup', 'https://example.invalid/2b')$$, '23505');
SELECT pg_temp.expect_error('excerpt_only_where_allowed',
  $$UPDATE item SET excerpt = 'some text' WHERE id = 2$$, 'C-002.8');
SELECT pg_temp.expect_error('english_only',
  $$INSERT INTO item (public_id, kind, source_id, dedup_key, headline, url, language)
    VALUES ('it_01J9Z3M4R7ABCDEFGHJKMNPQRX', 'article', 'src_pub_a', 'u:9', 'x', 'https://example.invalid/9', 'hi')$$, '23514');

-- ---------------------------------------------------------------------
-- Stories — PRD-002 §4, PRD-001, PRD-004
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('item_in_one_story_only',
  $$INSERT INTO story_item (item_id, story_id) VALUES (2, 2)$$, '23505');
SELECT pg_temp.expect_error('primary_item_must_belong_to_story',
  $$INSERT INTO story (id, public_id, first_seen_at, primary_item_id) OVERRIDING SYSTEM VALUE
      VALUES (3, 'st_01J9Z3K8Q2ABCDEFGHJKMNPQRV', now(), 5);
    INSERT INTO story_event_type (story_id, code, source) VALUES (3, 'other', 'rule');
    SET CONSTRAINTS ALL IMMEDIATE$$, '23503');
SELECT pg_temp.expect_error('story_needs_event_type',
  $$INSERT INTO story (id, public_id, first_seen_at, primary_item_id) OVERRIDING SYSTEM VALUE
      VALUES (4, 'st_01J9Z3K8Q2ABCDEFGHJKMNPQRW', now(), 4);
    INSERT INTO story_item (item_id, story_id) VALUES (4, 4);
    SET CONSTRAINTS ALL IMMEDIATE$$, 'US-004.1');
SELECT pg_temp.expect_error('story_cannot_lose_last_event_type',
  $$DELETE FROM story_event_type WHERE story_id = 1;
    SET CONSTRAINTS ALL IMMEDIATE$$, 'US-004.1');
SELECT pg_temp.expect_error('rows_never_move',
  $$UPDATE story SET first_seen_at = now() + interval '1 hour' WHERE id = 1$$, 'immutable');
SELECT pg_temp.expect_error('model_tag_needs_calibration_version',
  $$INSERT INTO story_tag (story_id, isin, method, confidence) VALUES (1, 'INE000B01012', 'model', 0.97)$$, '23514');
SELECT pg_temp.expect_error('non_model_tag_is_certain',
  $$INSERT INTO story_tag (story_id, isin, method, confidence) VALUES (1, 'INE000B01012', 'operator', 0.5)$$, '23514');

BEGIN;
INSERT INTO story_tag (story_id, isin, method, confidence, calibration_version) VALUES (1, 'INE000B01012', 'model', 0.80, 'cal-1');
COMMIT;
SELECT pg_temp.expect_true('low_confidence_model_tag_hidden',
  NOT EXISTS (SELECT 1 FROM story_tag_display WHERE story_id = 1 AND isin = 'INE000B01012'));
SELECT pg_temp.expect_true('exchange_tag_shown',
  EXISTS (SELECT 1 FROM story_tag_display WHERE story_id = 1 AND isin = 'INE000A01011'));
SELECT pg_temp.expect_true('story_time_denormalised_on_tag',
  (SELECT story_first_seen_at FROM story_tag WHERE story_id = 1 AND isin = 'INE000A01011')
  = (SELECT first_seen_at FROM story WHERE id = 1));

-- ---------------------------------------------------------------------
-- Summaries — PRD-004 §5, D-025
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('summary_only_of_filings',
  $$INSERT INTO story_summary (story_id, source_item_id, body, citations, checks, model_id, prompt_version, ai_call_id)
    VALUES (1, 2, 'Short summary.', '[]', '{}', 'claude-haiku-4-5', 'p1', 1)$$, '23503');
SELECT pg_temp.expect_error('summary_max_100_words',
  format($$INSERT INTO story_summary (story_id, source_item_id, body, citations, checks, model_id, prompt_version, ai_call_id)
    VALUES (1, 1, %L, '[]', '{}', 'claude-haiku-4-5', 'p1', 1)$$, repeat('word ', 101)), '23514');

-- ---------------------------------------------------------------------
-- Votes — PRD-005
-- ---------------------------------------------------------------------
BEGIN;
INSERT INTO vote_directional (story_id, user_id, direction) VALUES (1, 1, 'bullish'), (1, 2, 'bearish');
INSERT INTO vote_quality (story_id, user_id, kind) VALUES (1, 1, 'important');
COMMIT;
SELECT pg_temp.expect_error('one_directional_vote_per_user_per_story',
  $$INSERT INTO vote_directional (story_id, user_id, direction) VALUES (1, 1, 'neutral')$$, '23505');
SELECT pg_temp.expect_error('wrong_stock_needs_isin',
  $$INSERT INTO vote_quality (story_id, user_id, kind) VALUES (1, 2, 'wrong_stock')$$, '23514');
SELECT pg_temp.expect_true('counts_maintained',
  (SELECT (bullish, bearish, neutral, important) = (1, 1, 0, 1) FROM story_vote_count WHERE story_id = 1));
UPDATE vote_directional SET discounted_at = now() WHERE story_id = 1 AND user_id = 2;
SELECT pg_temp.expect_true('discounted_votes_not_counted',
  (SELECT bearish FROM story_vote_count WHERE story_id = 1) = 0);

-- ---------------------------------------------------------------------
-- Comments — PRD-006
-- ---------------------------------------------------------------------
BEGIN;
INSERT INTO comment (id, public_id, story_id, user_id, body) OVERRIDING SYSTEM VALUE VALUES
  (1, 'cm_01J9Z3K8Q2ABCDEFGHJKMNPQRS', 1, 1, 'level one');
INSERT INTO comment (id, public_id, story_id, user_id, parent_id, body) OVERRIDING SYSTEM VALUE VALUES
  (2, 'cm_01J9Z3K8Q2ABCDEFGHJKMNPQRT', 1, 2, 1, 'level two');
INSERT INTO comment (id, public_id, story_id, user_id, parent_id, body) OVERRIDING SYSTEM VALUE VALUES
  (3, 'cm_01J9Z3K8Q2ABCDEFGHJKMNPQRV', 1, 1, 2, 'level three');
INSERT INTO comment (id, public_id, story_id, user_id, parent_id, body) OVERRIDING SYSTEM VALUE VALUES
  (4, 'cm_01J9Z3K8Q2ABCDEFGHJKMNPQRW', 1, 2, 3, 'reply to level three');
COMMIT;
SELECT pg_temp.expect_true('depth_capped_at_three',
  (SELECT depth = 3 AND parent_id = 2 FROM comment WHERE id = 4));
SELECT pg_temp.expect_error('comment_max_2000_chars',
  format($$INSERT INTO comment (public_id, story_id, user_id, body) VALUES ('cm_01J9Z3K8Q2ABCDEFGHJKMNPQRX', 1, 1, %L)$$, repeat('x', 2001)), '23514');
SELECT pg_temp.expect_error('removed_comment_needs_reason',
  $$UPDATE comment SET state = 'removed', body = NULL WHERE id = 1$$, '23514');
SELECT pg_temp.expect_error('legal_takedown_needs_grievance',
  $$INSERT INTO takedown (comment_id, reason, operator_id) VALUES (1, 'court_order', 1)$$, '23514');
INSERT INTO grievance (reference, source) VALUES ('GR-2026-000001', 'court_order');
SELECT pg_temp.expect_true('court_order_due_in_36_hours',
  (SELECT resolve_due_at - received_at = interval '36 hours' FROM grievance WHERE reference = 'GR-2026-000001'));

-- ---------------------------------------------------------------------
-- Alerts — PRD-003
-- ---------------------------------------------------------------------
INSERT INTO alert (public_id, user_id, story_id, kind, via, channels)
  VALUES ('al_01J9Z3K8Q2ABCDEFGHJKMNPQRS', 1, 1, 'alert', 'individual', ARRAY['email']);
SELECT pg_temp.expect_error('one_alert_per_story_per_user',
  $$INSERT INTO alert (public_id, user_id, story_id, kind, via, channels)
    VALUES ('al_01J9Z3K8Q2ABCDEFGHJKMNPQRT', 1, 1, 'alert', 'digest', ARRAY['email'])$$, '23505');
SELECT pg_temp.expect_error('alert_channels_restricted',
  $$INSERT INTO alert (public_id, user_id, story_id, kind, via, channels)
    VALUES ('al_01J9Z3K8Q2ABCDEFGHJKMNPQRV', 2, 1, 'alert', 'individual', ARRAY['sms'])$$, '23514');

-- ---------------------------------------------------------------------
-- Users — PRD-007
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_error('age_confirmation_required',
  $$INSERT INTO app_user (public_id, username, email, terms_accepted_at, privacy_consent_at)
    VALUES ('us_01J9Z3K8Q2ABCDEFGHJKMNPQRV', 'trader_c', 'c@example.invalid', now(), now())$$, '23502');
SELECT pg_temp.expect_error('reserved_username',
  $$INSERT INTO app_user (public_id, username, email, age_confirmed_at, terms_accepted_at, privacy_consent_at)
    VALUES ('us_01J9Z3K8Q2ABCDEFGHJKMNPQRW', 'SEBI', 'd@example.invalid', now(), now(), now())$$, 'username_reserved');
SELECT pg_temp.expect_error('nse_symbol_username',
  $$INSERT INTO app_user (public_id, username, email, age_confirmed_at, terms_accepted_at, privacy_consent_at)
    VALUES ('us_01J9Z3K8Q2ABCDEFGHJKMNPQRX', 'newco', 'e@example.invalid', now(), now(), now())$$, 'NSE symbol');
SELECT pg_temp.expect_error('username_format',
  $$INSERT INTO app_user (public_id, username, email, age_confirmed_at, terms_accepted_at, privacy_consent_at)
    VALUES ('us_01J9Z3K8Q2ABCDEFGHJKMNPQRY', 'a b', 'f@example.invalid', now(), now(), now())$$, 'username');
SELECT pg_temp.expect_error('operator_requires_2fa',
  $$UPDATE app_user SET role = 'operator' WHERE id = 1$$, '23514');
INSERT INTO trial (user_id, ends_at) VALUES (1, now() + interval '14 days');
SELECT pg_temp.expect_error('trial_once_per_account',
  $$INSERT INTO trial (user_id, ends_at) VALUES (1, now() + interval '14 days')$$, '23505');
SELECT pg_temp.expect_true('trial_makes_user_paid',
  (SELECT tier FROM user_tier WHERE user_id = 1) = 'paid');
SELECT pg_temp.expect_true('no_trial_means_free',
  (SELECT tier FROM user_tier WHERE user_id = 2) = 'free');

INSERT INTO stream_seen (user_id, view, last_seen_at) VALUES (1, 'latest', '2026-10-05 10:00+00');
UPDATE stream_seen SET last_seen_at = '2026-10-05 09:00+00' WHERE user_id = 1 AND view = 'latest';
SELECT pg_temp.expect_true('unread_marker_never_moves_back',
  (SELECT last_seen_at FROM stream_seen WHERE user_id = 1 AND view = 'latest') = '2026-10-05 10:00+00');

-- ---------------------------------------------------------------------
-- Audit — GUARDRAILS §4.8
-- ---------------------------------------------------------------------
INSERT INTO audit_log (actor_type, actor_id, action, entity_type, entity_id, after)
  VALUES ('user', 1, 'vote.cast', 'story', 'st_01J9Z3K8Q2ABCDEFGHJKMNPQRS', '{"direction":"bullish"}');
SELECT pg_temp.expect_error('audit_log_no_update',
  $$UPDATE audit_log SET action = 'vote.changed'$$, 'append-only');
SELECT pg_temp.expect_error('audit_log_no_delete',
  $$DELETE FROM audit_log$$, 'append-only');

SET ROLE stockpanic_app;
SELECT pg_temp.expect_error('app_role_cannot_update_audit',
  $$UPDATE audit_log SET action = 'x'$$, '42501');
SELECT pg_temp.expect_error('app_role_cannot_touch_partition_directly',
  format('SELECT 1 FROM %I', 'audit_log_' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMM')), '42501');
SELECT pg_temp.expect_error('app_role_cannot_change_taxonomy',
  $$INSERT INTO event_type (code, label, alert_default, taxonomy_version) VALUES ('x', 'X', false, 1)$$, '42501');
SELECT pg_temp.expect_true('app_role_can_read_through_parent',
  (SELECT count(*) FROM audit_log) >= 1);
RESET ROLE;

-- ---------------------------------------------------------------------
-- Partitions exist ahead
-- ---------------------------------------------------------------------
SELECT pg_temp.expect_true('monthly_partitions_created',
  (SELECT count(*) FROM pg_inherits WHERE inhparent = 'audit_log'::regclass) >= 5);
SELECT pg_temp.expect_true('daily_live_event_partitions_created',
  (SELECT count(*) FROM pg_inherits WHERE inhparent = 'live_event'::regclass) >= 5);

\echo 'ALL CONSTRAINT TESTS PASSED'
