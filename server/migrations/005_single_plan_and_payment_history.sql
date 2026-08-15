-- Enforce the post-launch rule that one Clerk account may have only one
-- entitled paid plan, retain a sanitized payment ledger for the account UI,
-- and make scheduled extension-session cleanup index-friendly.

ALTER TABLE billing_memberships
  ADD COLUMN single_plan_guard text;

ALTER TABLE billing_memberships
  ADD CONSTRAINT billing_memberships_single_plan_guard_owner_check
  CHECK (
    single_plan_guard IS NULL OR single_plan_guard = clerk_user_id
  );

-- Existing test accounts may already contain both Plus and Ultra. Backfill
-- the guard only where it is unambiguous so this migration never fails or
-- silently changes an existing Whop subscription.
UPDATE billing_memberships AS membership
SET single_plan_guard = membership.clerk_user_id
WHERE membership.access_state IN ('active', 'cancel_at_period_end')
  AND NOT EXISTS (
    SELECT 1
    FROM billing_memberships AS other
    WHERE other.provider_mode = membership.provider_mode
      AND other.clerk_user_id = membership.clerk_user_id
      AND other.provider_membership_id <> membership.provider_membership_id
      AND other.access_state IN ('active', 'cancel_at_period_end')
  );

CREATE UNIQUE INDEX billing_memberships_one_guarded_open_per_user_idx
  ON billing_memberships (provider_mode, single_plan_guard)
  WHERE single_plan_guard IS NOT NULL
    AND access_state IN ('active', 'cancel_at_period_end');

CREATE TABLE billing_payment_history (
  provider_mode text NOT NULL CHECK (provider_mode IN ('test', 'live')),
  provider_payment_id text NOT NULL,
  clerk_user_id text NOT NULL,
  provider_membership_id text,
  plan_code text NOT NULL CHECK (plan_code IN ('plus', 'ultra')),
  display_status text NOT NULL CHECK (display_status IN ('paid', 'disputed', 'refunded')),
  provider_substatus text NOT NULL,
  paid_at timestamptz,
  provider_created_at timestamptz,
  provider_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_mode, provider_payment_id)
);

CREATE INDEX billing_payment_history_user_idx
  ON billing_payment_history (
    provider_mode, clerk_user_id, provider_updated_at DESC
  );

CREATE INDEX extension_pairing_grants_consumed_idx
  ON extension_pairing_grants (consumed_at)
  WHERE consumed_at IS NOT NULL;

CREATE INDEX extension_device_sessions_revoked_idx
  ON extension_device_sessions (revoked_at)
  WHERE revoked_at IS NOT NULL;
