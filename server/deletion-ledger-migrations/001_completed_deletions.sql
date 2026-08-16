CREATE TABLE completed_deletion_ledger (
  ledger_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_id uuid PRIMARY KEY,
  subject_hmac text NOT NULL CHECK (length(subject_hmac) = 64),
  encryption_key_version integer NOT NULL CHECK (encryption_key_version > 0),
  user_id_ciphertext bytea NOT NULL,
  encryption_nonce bytea NOT NULL CHECK (octet_length(encryption_nonce) = 12),
  encryption_auth_tag bytea NOT NULL CHECK (octet_length(encryption_auth_tag) = 16),
  completed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX completed_deletion_replay_idx
  ON completed_deletion_ledger (completed_at, ledger_sequence);

CREATE OR REPLACE FUNCTION reject_completed_deletion_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'COMPLETED_DELETION_LEDGER_APPEND_ONLY';
END;
$$;

CREATE TRIGGER completed_deletion_ledger_append_only
  BEFORE UPDATE OR DELETE ON completed_deletion_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_completed_deletion_ledger_mutation();
