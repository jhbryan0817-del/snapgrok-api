-- Whop sandbox billing tables deliberately live alongside the legacy Lemon
-- Squeezy tables for one reversible validation cycle. No Lemon customers are
-- migrated, and all new writes use these provider-neutral tables.

CREATE TABLE billing_checkout_sessions (
  id uuid PRIMARY KEY,
  clerk_user_id text NOT NULL,
  requested_plan text NOT NULL CHECK (requested_plan IN ('plus', 'ultra')),
  provider text NOT NULL DEFAULT 'whop' CHECK (provider = 'whop'),
  company_id text NOT NULL,
  product_id text NOT NULL,
  plan_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checkout_created', 'consumed', 'failed', 'expired')),
  provider_checkout_id text,
  checkout_url text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX billing_checkout_sessions_user_status_idx
  ON billing_checkout_sessions (clerk_user_id, status, expires_at DESC);

CREATE TABLE billing_memberships (
  provider text NOT NULL DEFAULT 'whop' CHECK (provider = 'whop'),
  provider_membership_id text PRIMARY KEY,
  clerk_user_id text NOT NULL,
  provider_member_id text,
  provider_user_id text,
  company_id text NOT NULL,
  product_id text NOT NULL,
  plan_id text NOT NULL,
  plan_code text NOT NULL CHECK (plan_code IN ('plus', 'ultra')),
  provider_status text NOT NULL,
  access_state text NOT NULL
    CHECK (access_state IN ('active', 'cancel_at_period_end', 'payment_failed', 'inactive')),
  renewal_period_start timestamptz,
  renewal_period_end timestamptz,
  period_started_at timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  checkout_configuration_id text,
  last_payment_id text,
  provider_created_at timestamptz NOT NULL,
  provider_updated_at timestamptz NOT NULL,
  state_changed_at timestamptz NOT NULL,
  last_event_id text NOT NULL,
  last_event_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    access_state NOT IN ('active', 'cancel_at_period_end') OR
    (renewal_period_start IS NOT NULL AND renewal_period_end IS NOT NULL AND
      renewal_period_end > renewal_period_start)
  )
);

CREATE INDEX billing_memberships_user_idx
  ON billing_memberships (clerk_user_id, provider_updated_at DESC);

CREATE INDEX billing_memberships_state_idx
  ON billing_memberships (access_state, renewal_period_end);

-- One non-terminal paid relationship per Clerk user. This enforces the
-- no-upgrade/no-downgrade/no-transfer boundary at the database layer too.
CREATE UNIQUE INDEX billing_memberships_one_open_per_user_idx
  ON billing_memberships (clerk_user_id)
  WHERE access_state <> 'inactive';

CREATE TABLE billing_provider_events (
  provider text NOT NULL CHECK (provider = 'whop'),
  delivery_id text NOT NULL,
  event_name text NOT NULL,
  company_id text,
  resource_type text,
  resource_id text,
  event_created_at timestamptz NOT NULL,
  payload_digest text NOT NULL CHECK (length(payload_digest) = 64),
  processing_state text NOT NULL
    CHECK (processing_state IN ('received', 'processed', 'ignored', 'quarantined', 'failed')),
  processing_error text,
  sanitized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  PRIMARY KEY (provider, delivery_id)
);

CREATE INDEX billing_provider_events_received_idx
  ON billing_provider_events (received_at DESC);

CREATE INDEX billing_provider_events_state_idx
  ON billing_provider_events (processing_state, received_at);
