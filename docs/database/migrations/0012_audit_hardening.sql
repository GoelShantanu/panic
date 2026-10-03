-- 0012_audit_hardening.sql (Backend exit review: GUARDRAILS §4.8, §4.9; D-039)

BEGIN;
SET LOCAL timezone TO 'UTC';

-- §4.9: source tiers are the publisher weights. Every change to a source (tier, enablement,
-- adapter, cadence, access basis) is audited by the database, whatever path made it.
CREATE FUNCTION audit_source_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit_log (actor_type, action, entity_type, entity_id, before, after)
  VALUES ('system', 'source.' || lower(TG_OP), 'source', CASE WHEN TG_OP = 'DELETE' THEN OLD.source_id ELSE NEW.source_id END,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN NULL;
END $$;
CREATE TRIGGER source_audit AFTER INSERT OR UPDATE OR DELETE ON source
  FOR EACH ROW EXECUTE FUNCTION audit_source_change();

-- §4.8: guardrail switches (kill switches, τ, AI cap) are audited even when changed outside the
-- application. Application paths write a richer row (operator, reason) and mark the transaction.
CREATE FUNCTION audit_setting_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('stockpanic.audited', true), '') <> 'on' THEN
    INSERT INTO audit_log (actor_type, action, entity_type, entity_id, before, after)
    VALUES ('system', 'setting.changed_direct', 'setting', NEW.key, jsonb_build_object('value', OLD.value), jsonb_build_object('value', NEW.value));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER setting_audit AFTER UPDATE ON setting
  FOR EACH ROW WHEN (OLD.value IS DISTINCT FROM NEW.value) EXECUTE FUNCTION audit_setting_change();

-- §4.8: AI call records are immutable once written (retention drops whole partitions).
CREATE FUNCTION ai_call_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GUARDRAILS 4.8: ai_call is append-only';
END $$;
CREATE TRIGGER ai_call_append_only BEFORE UPDATE OR DELETE ON ai_call
  FOR EACH ROW EXECUTE FUNCTION ai_call_append_only();

-- Correction (D-039): the AI spend cap converts USD at this rate. 84 was an [ASSUMPTION]; NSE showed
-- USDINR futures at 96.5425 on 2026-10-01 [VERIFIED], so 84 undercounted spend by ~13%. Applied only
-- where the old default is still in place; audited by the trigger above.
UPDATE setting SET value = '96.5' WHERE key = 'ai_usd_inr' AND value = '84.0'::jsonb;

INSERT INTO schema_migrations (version) VALUES ('0012_audit_hardening');

COMMIT;
