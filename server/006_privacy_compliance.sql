-- Privacy/legal-retention boundary for the Whop-only production system.
-- This migration is intentionally forward-only. The three Lemon Squeezy
-- tables from migration 001 are dropped only when they are empty; a non-zero
-- count stops deployment so an operator can review/archive the records first.

CREATE SCHEMA IF NOT EXISTS legal_retention;

CREATE TABLE legal_retention.transaction_records (
  record_id uuid PRIMARY KEY,
  record_category text NOT NULL CHECK (record_category IN (
    'contract_withdrawal', 'payment_supply', 'complaint_dispute'
  )),
  subject_lookup_hmac text NOT NULL CHECK (length(subject_lookup_hmac) = 64),
  former_account_hmac text NOT NULL CHECK (length(former_account_hmac) = 64),
  hmac_key_version integer NOT NULL CHECK (hmac_key_version > 0),
  provider text NOT NULL DEFAULT 'whop' CHECK (provider = 'whop'),
  provider_mode text NOT NULL CHECK (provider_mode IN ('test', 'live')),
  company_id text,
  provider_checkout_id text,
  provider_membership_id text,
  provider_payment_id text,
  product_id text,
  plan_id text,
  plan_code text CHECK (plan_code IS NULL OR plan_code IN ('plus', 'ultra')),
  settlement_amount numeric,
  currency text,
  tax_amount numeric,
  tax_behavior text,
  billing_reason text,
  status text,
  provider_updated_at timestamptz,
  contracted_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,
  refunded_at timestamptz,
  disputed_at timestamptz,
  retention_basis text NOT NULL,
  retention_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    provider_checkout_id IS NOT NULL OR
    provider_membership_id IS NOT NULL OR
    provider_payment_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX legal_transaction_payment_category_uidx
  ON legal_retention.transaction_records (
    provider, provider_mode, record_category, provider_payment_id
  )
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX legal_transaction_membership_category_uidx
  ON legal_retention.transaction_records (
    provider, provider_mode, record_category, provider_membership_id
  )
  WHERE provider_payment_id IS NULL AND provider_membership_id IS NOT NULL;

CREATE UNIQUE INDEX legal_transaction_checkout_category_uidx
  ON legal_retention.transaction_records (
    provider, provider_mode, record_category, provider_checkout_id
  )
  WHERE provider_payment_id IS NULL
    AND provider_membership_id IS NULL
    AND provider_checkout_id IS NOT NULL;

CREATE INDEX legal_transaction_subject_idx
  ON legal_retention.transaction_records (subject_lookup_hmac, created_at DESC);

CREATE INDEX legal_transaction_former_account_idx
  ON legal_retention.transaction_records (former_account_hmac, created_at DESC);

CREATE INDEX legal_transaction_expiry_idx
  ON legal_retention.transaction_records (retention_expires_at, record_id);

CREATE TABLE privacy_request_audit (
  request_id uuid PRIMARY KEY,
  subject_hmac text NOT NULL CHECK (length(subject_hmac) = 64),
  request_type text NOT NULL CHECK (request_type IN ('export', 'delete')),
  state text NOT NULL CHECK (state IN (
    'received', 'blocked', 'partial', 'complete', 'failed'
  )),
  received_at timestamptz NOT NULL,
  completed_at timestamptz,
  exception_code text,
  purge_after timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX privacy_request_one_deletion_per_subject_uidx
  ON privacy_request_audit (subject_hmac)
  WHERE request_type = 'delete';

CREATE INDEX privacy_request_purge_idx
  ON privacy_request_audit (purge_after, request_id);

-- Short-lived operational identity lookup. It contains no email address; only
-- dedicated-key HMACs. It is deleted with the live account.
CREATE TABLE privacy_subject_index (
  clerk_user_id text PRIMARY KEY,
  subject_lookup_hmac text NOT NULL CHECK (length(subject_lookup_hmac) = 64),
  former_account_hmac text NOT NULL CHECK (length(former_account_hmac) = 64),
  hmac_key_version integer NOT NULL CHECK (hmac_key_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX privacy_subject_lookup_idx
  ON privacy_subject_index (subject_lookup_hmac);

-- Raw Clerk IDs exist here only while deletion needs an external retry. The
-- row is removed after Clerk/Whop cleanup completes; the minimized audit row
-- remains as the backup-restore/deletion ledger.
CREATE TABLE privacy_deletion_queue (
  request_id uuid PRIMARY KEY REFERENCES privacy_request_audit(request_id),
  clerk_user_id text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('blocked', 'partial')),
  identity_loaded boolean NOT NULL DEFAULT false,
  archive_complete boolean NOT NULL DEFAULT false,
  provider_cancellation_complete boolean NOT NULL DEFAULT false,
  local_deletion_complete boolean NOT NULL DEFAULT false,
  clerk_deletion_started boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX privacy_deletion_retry_idx
  ON privacy_deletion_queue (next_retry_at, request_id);

-- Only provider mode + membership ID are needed after operational rows have
-- been erased but a temporary Whop failure still requires cancellation.
CREATE TABLE privacy_deletion_membership_retries (
  request_id uuid NOT NULL REFERENCES privacy_deletion_queue(request_id)
    ON DELETE CASCADE,
  provider_mode text NOT NULL CHECK (provider_mode IN ('test', 'live')),
  provider_membership_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, provider_mode, provider_membership_id)
);

-- A Whop checkout configuration can outlive its local URL. This minimized,
-- non-user-identifying tombstone lets a late post-deletion purchase be
-- terminated without recreating a Clerk link or Zenaian entitlement. Whop
-- exposes no documented checkout-configuration revocation or bounded expiry,
-- so the provider/catalog block is retained while that remains true.
CREATE TABLE billing_checkout_tombstones (
  provider_mode text NOT NULL CHECK (provider_mode IN ('test', 'live')),
  provider_checkout_id text NOT NULL,
  company_id text NOT NULL,
  product_id text NOT NULL,
  plan_id text NOT NULL,
  plan_code text NOT NULL CHECK (plan_code IN ('plus', 'ultra')),
  prior_membership_ids text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (array_position(prior_membership_ids, NULL) IS NULL),
  provider_membership_id text,
  termination_state text NOT NULL DEFAULT 'pending'
    CHECK (termination_state IN ('pending', 'confirmed')),
  termination_attempted_at timestamptz,
  termination_confirmed_at timestamptz,
  provider_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_mode, provider_checkout_id)
);

CREATE UNIQUE INDEX billing_checkout_tombstone_membership_uidx
  ON billing_checkout_tombstones (provider_mode, provider_membership_id)
  WHERE provider_membership_id IS NOT NULL;

CREATE INDEX billing_checkout_tombstone_pending_idx
  ON billing_checkout_tombstones (
    provider_mode,
    (COALESCE(termination_attempted_at, created_at)),
    provider_checkout_id
  )
  WHERE termination_state = 'pending'
    AND provider_membership_id IS NOT NULL;

CREATE INDEX extension_pairing_grants_user_privacy_idx
  ON extension_pairing_grants (clerk_user_id, created_at DESC);

-- Defense in depth for the narrow race between an application-level privacy
-- check and an INSERT. Updates are also guarded by service/store transactions,
-- while cleanup/revocation DELETEs remain possible after the block is set.
CREATE OR REPLACE FUNCTION privacy_reject_blocked_user_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $privacy_block_trigger$
BEGIN
  IF TG_TABLE_NAME = 'privacy_subject_index'
     AND current_setting('zenaian.privacy_deletion_worker', true) = 'on'
     AND EXISTS (
       SELECT 1 FROM privacy_deletion_queue
       WHERE clerk_user_id = NEW.clerk_user_id
     ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM privacy_deletion_queue
    WHERE clerk_user_id = NEW.clerk_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ACCOUNT_DELETION_IN_PROGRESS';
  END IF;
  RETURN NEW;
END;
$privacy_block_trigger$;

CREATE TRIGGER privacy_block_pairing_insert
  BEFORE INSERT ON extension_pairing_grants
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

CREATE TRIGGER privacy_block_device_session_insert
  BEFORE INSERT ON extension_device_sessions
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

CREATE TRIGGER privacy_block_usage_period_insert
  BEFORE INSERT ON billing_usage_periods
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

CREATE TRIGGER privacy_block_analysis_usage_insert
  BEFORE INSERT ON billing_analysis_usage
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

CREATE TRIGGER privacy_block_checkout_insert
  BEFORE INSERT ON billing_checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

CREATE TRIGGER privacy_block_membership_insert
  BEFORE INSERT ON billing_memberships
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

CREATE TRIGGER privacy_block_payment_history_insert
  BEFORE INSERT ON billing_payment_history
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

CREATE TRIGGER privacy_block_subject_index_write
  BEFORE INSERT OR UPDATE ON privacy_subject_index
  FOR EACH ROW EXECUTE FUNCTION privacy_reject_blocked_user_insert();

-- Provider-native checkout IDs are the privacy-preserving ownership key.
CREATE UNIQUE INDEX billing_checkout_sessions_provider_checkout_uidx
  ON billing_checkout_sessions (provider_mode, provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;

-- Keep the live account payment view compact while preserving only the
-- minimum transaction evidence needed for the separated archive.
ALTER TABLE billing_payment_history
  ADD COLUMN provider_checkout_id text,
  ADD COLUMN product_id text,
  ADD COLUMN plan_id text,
  ADD COLUMN company_id text,
  ADD COLUMN settlement_amount numeric,
  ADD COLUMN currency text,
  ADD COLUMN tax_amount numeric,
  ADD COLUMN tax_behavior text,
  ADD COLUMN billing_reason text,
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN disputed_at timestamptz,
  ADD COLUMN archived_at timestamptz;

-- Materialize the minimum statutory record in the same transaction as the
-- provider-derived operational row. The subject HMAC index is populated only
-- from a server-side Clerk lookup before checkout/account operations; if it is
-- not present yet, the privacy service backfills the archive when that identity
-- is next verified.
CREATE OR REPLACE FUNCTION privacy_deterministic_record_uuid(seed text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
STRICT
AS $privacy_uuid$
  SELECT (
    substr(md5(seed), 1, 8) || '-' ||
    substr(md5(seed), 9, 4) || '-' ||
    substr(md5(seed), 13, 4) || '-' ||
    substr(md5(seed), 17, 4) || '-' ||
    substr(md5(seed), 21, 12)
  )::uuid
$privacy_uuid$;

CREATE OR REPLACE FUNCTION privacy_archive_membership_change()
RETURNS trigger
LANGUAGE plpgsql
AS $privacy_membership_archive$
DECLARE
  identity privacy_subject_index%ROWTYPE;
  evidence_at timestamptz;
BEGIN
  SELECT * INTO identity
  FROM privacy_subject_index
  WHERE clerk_user_id = NEW.clerk_user_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  evidence_at := COALESCE(
    NEW.provider_created_at,
    NEW.period_started_at,
    NEW.state_changed_at,
    now()
  );
  INSERT INTO legal_retention.transaction_records (
    record_id, record_category, subject_lookup_hmac,
    former_account_hmac, hmac_key_version, provider, provider_mode,
    company_id, provider_checkout_id, provider_membership_id,
    product_id, plan_id, plan_code, status, provider_updated_at,
    contracted_at, canceled_at,
    retention_basis, retention_expires_at
  ) VALUES (
    privacy_deterministic_record_uuid(
      'membership|' || NEW.provider_mode || '|' || NEW.provider_membership_id
    ),
    'contract_withdrawal', identity.subject_lookup_hmac,
    identity.former_account_hmac, identity.hmac_key_version, 'whop',
    NEW.provider_mode, NEW.company_id, NEW.checkout_configuration_id,
    NEW.provider_membership_id, NEW.product_id, NEW.plan_id, NEW.plan_code,
    NEW.provider_status, NEW.provider_updated_at, evidence_at, NEW.canceled_at,
    'Korean E-Commerce Act contract/withdrawal record - 5 years',
    GREATEST(evidence_at, COALESCE(NEW.canceled_at, evidence_at)) +
      interval '5 years'
  )
  ON CONFLICT (
    provider, provider_mode, record_category, provider_membership_id
  ) WHERE provider_payment_id IS NULL AND provider_membership_id IS NOT NULL
  DO UPDATE SET
    subject_lookup_hmac = EXCLUDED.subject_lookup_hmac,
    former_account_hmac = EXCLUDED.former_account_hmac,
    hmac_key_version = EXCLUDED.hmac_key_version,
    company_id = EXCLUDED.company_id,
    provider_checkout_id = COALESCE(
      EXCLUDED.provider_checkout_id,
      legal_retention.transaction_records.provider_checkout_id
    ),
    product_id = EXCLUDED.product_id,
    plan_id = EXCLUDED.plan_id,
    plan_code = EXCLUDED.plan_code,
    status = EXCLUDED.status,
    provider_updated_at = GREATEST(
      COALESCE(legal_retention.transaction_records.provider_updated_at,
               '-infinity'::timestamptz),
      COALESCE(EXCLUDED.provider_updated_at, '-infinity'::timestamptz)
    ),
    canceled_at = COALESCE(
      EXCLUDED.canceled_at,
      legal_retention.transaction_records.canceled_at
    ),
    retention_expires_at = GREATEST(
      legal_retention.transaction_records.retention_expires_at,
      EXCLUDED.retention_expires_at
    ),
    updated_at = now()
  WHERE legal_retention.transaction_records.former_account_hmac =
        EXCLUDED.former_account_hmac
    AND COALESCE(
          legal_retention.transaction_records.provider_updated_at,
          '-infinity'::timestamptz
        ) <= COALESCE(EXCLUDED.provider_updated_at,
                       '-infinity'::timestamptz);
  IF NOT FOUND THEN
    PERFORM 1
    FROM legal_retention.transaction_records AS archive
    WHERE archive.provider = 'whop'
      AND archive.provider_mode = NEW.provider_mode
      AND archive.record_category = 'contract_withdrawal'
      AND archive.provider_payment_id IS NULL
      AND archive.provider_membership_id = NEW.provider_membership_id
      AND archive.former_account_hmac = identity.former_account_hmac
      AND archive.company_id IS NOT DISTINCT FROM NEW.company_id
      AND archive.product_id IS NOT DISTINCT FROM NEW.product_id
      AND archive.plan_id IS NOT DISTINCT FROM NEW.plan_id
      AND archive.plan_code IS NOT DISTINCT FROM NEW.plan_code
      AND COALESCE(archive.provider_updated_at, '-infinity'::timestamptz) >=
          COALESCE(NEW.provider_updated_at, '-infinity'::timestamptz)
      AND archive.retention_expires_at >=
          GREATEST(evidence_at, COALESCE(NEW.canceled_at, evidence_at)) +
            interval '5 years';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END;
$privacy_membership_archive$;

CREATE OR REPLACE FUNCTION privacy_archive_payment_change()
RETURNS trigger
LANGUAGE plpgsql
AS $privacy_payment_archive$
DECLARE
  identity privacy_subject_index%ROWTYPE;
  evidence_at timestamptz;
  refund_at timestamptz;
  dispute_at timestamptz;
  dispute_evidence_at timestamptz;
  category text;
  category_at timestamptz;
  category_basis text;
  category_years integer;
BEGIN
  SELECT * INTO identity
  FROM privacy_subject_index
  WHERE clerk_user_id = NEW.clerk_user_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  evidence_at := COALESCE(
    NEW.paid_at,
    NEW.provider_created_at,
    NEW.provider_updated_at,
    now()
  );
  refund_at := COALESCE(
    NEW.refunded_at,
    CASE WHEN NEW.display_status = 'refunded'
      THEN COALESCE(NEW.provider_updated_at, evidence_at) END
  );
  dispute_at := COALESCE(
    NEW.disputed_at,
    CASE WHEN NEW.display_status = 'disputed'
      THEN COALESCE(NEW.provider_updated_at, evidence_at) END
  );
  dispute_evidence_at := CASE
    WHEN dispute_at IS NULL THEN NULL
    ELSE GREATEST(
      dispute_at,
      COALESCE(NEW.provider_updated_at, dispute_at)
    )
  END;

  FOR category, category_at, category_basis, category_years IN
    SELECT * FROM (VALUES
      ('payment_supply'::text, evidence_at,
       'Korean E-Commerce Act payment/supply record - 5 years'::text, 5),
      ('contract_withdrawal'::text, refund_at,
       'Korean E-Commerce Act contract/withdrawal record - 5 years'::text, 5),
      ('complaint_dispute'::text, dispute_evidence_at,
       'Korean E-Commerce Act complaint/dispute record - 3 years'::text, 3)
    ) AS categories(name, occurred_at, basis, years)
    WHERE occurred_at IS NOT NULL
  LOOP
    INSERT INTO legal_retention.transaction_records (
      record_id, record_category, subject_lookup_hmac,
      former_account_hmac, hmac_key_version, provider, provider_mode,
      company_id, provider_checkout_id, provider_membership_id,
      provider_payment_id, product_id, plan_id, plan_code,
      settlement_amount, currency, tax_amount, tax_behavior,
      billing_reason, status, provider_updated_at, paid_at,
      refunded_at, disputed_at,
      retention_basis, retention_expires_at
    ) VALUES (
      privacy_deterministic_record_uuid(
        'payment|' || NEW.provider_mode || '|' || category || '|' ||
        NEW.provider_payment_id
      ),
      category, identity.subject_lookup_hmac, identity.former_account_hmac,
      identity.hmac_key_version, 'whop', NEW.provider_mode, NEW.company_id,
      NEW.provider_checkout_id, NEW.provider_membership_id,
      NEW.provider_payment_id, NEW.product_id, NEW.plan_id, NEW.plan_code,
      NEW.settlement_amount, NEW.currency, NEW.tax_amount, NEW.tax_behavior,
      NEW.billing_reason, NEW.provider_substatus, NEW.provider_updated_at,
      NEW.paid_at,
      refund_at, dispute_at, category_basis,
      category_at + make_interval(years => category_years)
    )
    ON CONFLICT (
      provider, provider_mode, record_category, provider_payment_id
    ) WHERE provider_payment_id IS NOT NULL
    DO UPDATE SET
      subject_lookup_hmac = EXCLUDED.subject_lookup_hmac,
      former_account_hmac = EXCLUDED.former_account_hmac,
      hmac_key_version = EXCLUDED.hmac_key_version,
      company_id = EXCLUDED.company_id,
      provider_checkout_id = COALESCE(
        EXCLUDED.provider_checkout_id,
        legal_retention.transaction_records.provider_checkout_id
      ),
      provider_membership_id = COALESCE(
        EXCLUDED.provider_membership_id,
        legal_retention.transaction_records.provider_membership_id
      ),
      product_id = EXCLUDED.product_id,
      plan_id = EXCLUDED.plan_id,
      plan_code = EXCLUDED.plan_code,
      settlement_amount = COALESCE(
        EXCLUDED.settlement_amount,
        legal_retention.transaction_records.settlement_amount
      ),
      currency = COALESCE(
        EXCLUDED.currency,
        legal_retention.transaction_records.currency
      ),
      tax_amount = COALESCE(
        EXCLUDED.tax_amount,
        legal_retention.transaction_records.tax_amount
      ),
      tax_behavior = COALESCE(
        EXCLUDED.tax_behavior,
        legal_retention.transaction_records.tax_behavior
      ),
      billing_reason = COALESCE(
        EXCLUDED.billing_reason,
        legal_retention.transaction_records.billing_reason
      ),
      status = EXCLUDED.status,
      provider_updated_at = GREATEST(
        COALESCE(legal_retention.transaction_records.provider_updated_at,
                 '-infinity'::timestamptz),
        COALESCE(EXCLUDED.provider_updated_at, '-infinity'::timestamptz)
      ),
      paid_at = COALESCE(
        legal_retention.transaction_records.paid_at,
        EXCLUDED.paid_at
      ),
      refunded_at = COALESCE(
        EXCLUDED.refunded_at,
        legal_retention.transaction_records.refunded_at
      ),
      disputed_at = COALESCE(
        EXCLUDED.disputed_at,
        legal_retention.transaction_records.disputed_at
      ),
      retention_expires_at = GREATEST(
        legal_retention.transaction_records.retention_expires_at,
        EXCLUDED.retention_expires_at
      ),
      updated_at = now()
    WHERE legal_retention.transaction_records.former_account_hmac =
          EXCLUDED.former_account_hmac
      AND COALESCE(
            legal_retention.transaction_records.provider_updated_at,
            '-infinity'::timestamptz
          ) <= COALESCE(EXCLUDED.provider_updated_at,
                         '-infinity'::timestamptz);
    IF NOT FOUND THEN
      PERFORM 1
      FROM legal_retention.transaction_records AS archive
      WHERE archive.provider = 'whop'
        AND archive.provider_mode = NEW.provider_mode
        AND archive.record_category = category
        AND archive.provider_payment_id = NEW.provider_payment_id
        AND archive.former_account_hmac = identity.former_account_hmac
        AND archive.company_id IS NOT DISTINCT FROM NEW.company_id
        AND archive.product_id IS NOT DISTINCT FROM NEW.product_id
        AND archive.plan_id IS NOT DISTINCT FROM NEW.plan_id
        AND archive.plan_code IS NOT DISTINCT FROM NEW.plan_code
        AND COALESCE(archive.provider_updated_at, '-infinity'::timestamptz) >=
            COALESCE(NEW.provider_updated_at, '-infinity'::timestamptz)
        AND archive.retention_expires_at >=
            category_at + make_interval(years => category_years);
      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'PRIVACY_ARCHIVE_OWNERSHIP_CONFLICT';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$privacy_payment_archive$;

CREATE OR REPLACE FUNCTION privacy_mark_payment_archived()
RETURNS trigger
LANGUAGE plpgsql
AS $privacy_payment_mark$
BEGIN
  IF EXISTS (
    SELECT 1 FROM privacy_subject_index
    WHERE clerk_user_id = NEW.clerk_user_id
  ) THEN
    NEW.archived_at := now();
  END IF;
  RETURN NEW;
END;
$privacy_payment_mark$;

CREATE TRIGGER privacy_archive_membership
  AFTER INSERT OR UPDATE ON billing_memberships
  FOR EACH ROW EXECUTE FUNCTION privacy_archive_membership_change();

CREATE TRIGGER privacy_mark_payment_archive
  BEFORE INSERT OR UPDATE ON billing_payment_history
  FOR EACH ROW EXECUTE FUNCTION privacy_mark_payment_archived();

CREATE TRIGGER privacy_archive_payment
  AFTER INSERT OR UPDATE ON billing_payment_history
  FOR EACH ROW EXECUTE FUNCTION privacy_archive_payment_change();

CREATE INDEX billing_analysis_usage_settled_cleanup_idx
  ON billing_analysis_usage (settled_at, operation_id)
  WHERE state IN ('consumed', 'released');

CREATE INDEX billing_usage_periods_cleanup_idx
  ON billing_usage_periods (ends_at, id);

CREATE INDEX billing_checkout_sessions_cleanup_idx
  ON billing_checkout_sessions (status, updated_at, id);

CREATE INDEX billing_memberships_cleanup_idx
  ON billing_memberships (provider_mode, access_state, state_changed_at,
                          provider_membership_id);

CREATE INDEX billing_payment_history_cleanup_idx
  ON billing_payment_history (provider_mode, provider_updated_at,
                              provider_payment_id);

DO $privacy_legacy_guard$
DECLARE
  checkout_count bigint := 0;
  subscription_count bigint := 0;
  webhook_count bigint := 0;
BEGIN
  IF to_regclass('billing_checkout_intents') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM billing_checkout_intents' INTO checkout_count;
  END IF;
  IF to_regclass('billing_subscriptions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM billing_subscriptions' INTO subscription_count;
  END IF;
  IF to_regclass('billing_webhook_events') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM billing_webhook_events' INTO webhook_count;
  END IF;

  RAISE NOTICE 'Legacy Lemon Squeezy row counts: checkout_intents=%, subscriptions=%, webhook_events=%',
    checkout_count, subscription_count, webhook_count;

  IF checkout_count <> 0 OR subscription_count <> 0 OR webhook_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PRIVACY_LEGACY_LEMON_REVIEW_REQUIRED',
      DETAIL = format(
        'billing_checkout_intents=%s, billing_subscriptions=%s, billing_webhook_events=%s',
        checkout_count, subscription_count, webhook_count
      ),
      HINT = 'Review/archive confirmed records and empty only obsolete test data before rerunning migration 006.';
  END IF;
END;
$privacy_legacy_guard$;

DROP TABLE IF EXISTS billing_webhook_events;
DROP TABLE IF EXISTS billing_subscriptions;
DROP TABLE IF EXISTS billing_checkout_intents;
