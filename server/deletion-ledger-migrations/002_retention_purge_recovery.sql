ALTER TABLE completed_deletion_ledger
  ADD COLUMN purge_after timestamptz;

UPDATE completed_deletion_ledger
SET purge_after = completed_at + interval '400 days'
WHERE purge_after IS NULL;

ALTER TABLE completed_deletion_ledger
  ALTER COLUMN purge_after SET NOT NULL;

CREATE INDEX completed_deletion_expiry_idx
  ON completed_deletion_ledger (purge_after, ledger_sequence);

CREATE TABLE completed_retention_purge_ledger (
  ledger_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  marker_id uuid PRIMARY KEY,
  purge_cutoff_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  purge_after timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (purge_cutoff_at <= completed_at),
  CHECK (purge_after > completed_at)
);

CREATE INDEX completed_retention_purge_replay_idx
  ON completed_retention_purge_ledger (completed_at, ledger_sequence);

CREATE INDEX completed_retention_purge_expiry_idx
  ON completed_retention_purge_ledger (purge_after, ledger_sequence);

CREATE TRIGGER completed_retention_purge_ledger_append_only
  BEFORE UPDATE OR DELETE ON completed_retention_purge_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_completed_deletion_ledger_mutation();

CREATE OR REPLACE FUNCTION reject_completed_deletion_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('zenaian.ledger_purge_authorized', true) = '1'
     AND TG_OP = 'DELETE'
     AND OLD.purge_after <= now() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'COMPLETED_DELETION_LEDGER_APPEND_ONLY';
END;
$$;

CREATE FUNCTION purge_expired_privacy_ledger(p_cutoff timestamptz)
RETURNS TABLE (completed_deletions bigint, retention_purge_markers bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deletion_count bigint;
  marker_count bigint;
BEGIN
  IF p_cutoff IS NULL OR p_cutoff > now() THEN
    RAISE EXCEPTION 'PRIVACY_LEDGER_PURGE_CUTOFF_INVALID';
  END IF;
  PERFORM set_config('zenaian.ledger_purge_authorized', '1', true);
  DELETE FROM public.completed_deletion_ledger
  WHERE purge_after <= p_cutoff;
  GET DIAGNOSTICS deletion_count = ROW_COUNT;
  DELETE FROM public.completed_retention_purge_ledger
  WHERE purge_after <= p_cutoff;
  GET DIAGNOSTICS marker_count = ROW_COUNT;
  RETURN QUERY SELECT deletion_count, marker_count;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_privacy_ledger(timestamptz) FROM PUBLIC;
