-- Recover after a missed maintenance window without losing event IDs or payloads.
-- The parent lock blocks writers until all moved rows and partitions commit together.
BEGIN;
SET LOCAL timezone TO 'UTC';
SET LOCAL lock_timeout TO '5s';
SET LOCAL statement_timeout TO '60s';
LOCK TABLE live_event IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE sp_live_partition_move ON COMMIT DROP AS
  SELECT * FROM live_event_default WITH NO DATA;
DO $$
DECLARE
  day_start timestamptz := date_trunc('day', now());
  partition_start timestamptz;
  partition_name text;
  i integer;
BEGIN
  FOR i IN 0..3 LOOP
    partition_start := day_start + make_interval(days => i);
    partition_name := 'live_event_' || to_char(partition_start, 'YYYYMMDD');
    IF to_regclass(partition_name) IS NULL THEN
      TRUNCATE sp_live_partition_move;
      INSERT INTO sp_live_partition_move
        SELECT * FROM live_event_default
        WHERE created_at >= partition_start AND created_at < partition_start + interval '1 day';
      DELETE FROM live_event_default
        WHERE created_at >= partition_start AND created_at < partition_start + interval '1 day';
      EXECUTE format('CREATE TABLE %I PARTITION OF live_event FOR VALUES FROM (%L) TO (%L)',
        partition_name, partition_start, partition_start + interval '1 day');
      INSERT INTO live_event OVERRIDING SYSTEM VALUE SELECT * FROM sp_live_partition_move;
    END IF;
  END LOOP;
END $$;
COMMIT;
