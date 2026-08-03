CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE billing_checkout_intents (
  id uuid PRIMARY KEY,
  clerk_user_id text NOT NULL,
  requested_plan text NOT NULL CHECK (requested_plan IN ('plus', 'ultra')),
  variant_id bigint NOT NULL CHECK (variant_id > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checkout_created', 'consumed', 'failed', 'expired')),
  lemon_checkout_id text,
  checkout_url text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

CREATE INDEX billing_checkout_intents_user_status_idx
  ON billing_checkout_intents (clerk_user_id, status, expires_at DESC);

CREATE TABLE billing_subscriptions (
  lemon_subscription_id text PRIMARY KEY,
  clerk_user_id text NOT NULL,
  lemon_customer_id text NOT NULL,
  lemon_order_id text NOT NULL,
  store_id bigint NOT NULL CHECK (store_id > 0),
  product_id bigint NOT NULL CHECK (product_id > 0),
  variant_id bigint NOT NULL CHECK (variant_id > 0),
  status text NOT NULL,
  test_mode boolean NOT NULL,
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  lemon_created_at timestamptz NOT NULL,
  lemon_updated_at timestamptz NOT NULL,
  period_started_at timestamptz NOT NULL,
  last_event_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_subscriptions_user_idx
  ON billing_subscriptions (clerk_user_id, lemon_updated_at DESC);

CREATE INDEX billing_subscriptions_status_idx
  ON billing_subscriptions (status, renews_at);

CREATE TABLE billing_usage_periods (
  id uuid PRIMARY KEY,
  clerk_user_id text NOT NULL,
  period_key text NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('free', 'plus', 'ultra')),
  allowance integer NOT NULL CHECK (allowance > 0),
  consumed integer NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, period_key),
  CHECK (consumed + reserved <= allowance),
  CHECK (ends_at > starts_at)
);

CREATE INDEX billing_usage_periods_user_ends_idx
  ON billing_usage_periods (clerk_user_id, ends_at DESC);

CREATE TABLE billing_analysis_usage (
  operation_id uuid PRIMARY KEY,
  clerk_user_id text NOT NULL,
  usage_period_id uuid NOT NULL REFERENCES billing_usage_periods(id),
  plan_id text NOT NULL CHECK (plan_id IN ('free', 'plus', 'ultra')),
  model_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved', 'consumed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX billing_analysis_usage_user_created_idx
  ON billing_analysis_usage (clerk_user_id, created_at DESC);

CREATE INDEX billing_analysis_usage_reserved_idx
  ON billing_analysis_usage (state, created_at)
  WHERE state = 'reserved';

CREATE TABLE billing_webhook_events (
  delivery_hash text PRIMARY KEY CHECK (length(delivery_hash) = 64),
  event_name text NOT NULL,
  resource_type text,
  resource_id text,
  resource_updated_at timestamptz,
  processing_state text NOT NULL
    CHECK (processing_state IN ('received', 'processed', 'ignored', 'quarantined', 'failed')),
  processing_error text,
  body jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX billing_webhook_events_received_idx
  ON billing_webhook_events (received_at DESC);

CREATE INDEX billing_webhook_events_state_idx
  ON billing_webhook_events (processing_state, received_at);
