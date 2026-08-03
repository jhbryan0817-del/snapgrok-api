-- Isolate Whop sandbox and production records, permit one independent Plus
-- and one independent Ultra membership, and represent provider-side payment
-- reversals without deleting the subscription audit trail.

ALTER TABLE billing_checkout_sessions
  ADD COLUMN provider_mode text NOT NULL DEFAULT 'test'
    CHECK (provider_mode IN ('test', 'live'));

ALTER TABLE billing_memberships
  ADD COLUMN provider_mode text NOT NULL DEFAULT 'test'
    CHECK (provider_mode IN ('test', 'live'));

ALTER TABLE billing_provider_events
  ADD COLUMN provider_mode text NOT NULL DEFAULT 'test'
    CHECK (provider_mode IN ('test', 'live'));

ALTER TABLE billing_memberships
  DROP CONSTRAINT billing_memberships_access_state_check;

ALTER TABLE billing_memberships
  ADD CONSTRAINT billing_memberships_access_state_check
    CHECK (access_state IN (
      'active', 'cancel_at_period_end', 'payment_failed', 'revoked', 'inactive'
    ));

DROP INDEX billing_memberships_one_open_per_user_idx;

-- A customer may own Plus and Ultra at the same time, but duplicate open
-- subscriptions for the same plan remain blocked at the database boundary.
CREATE UNIQUE INDEX billing_memberships_one_open_per_plan_idx
  ON billing_memberships (provider_mode, clerk_user_id, plan_code)
  WHERE access_state IN ('active', 'cancel_at_period_end');

ALTER TABLE billing_memberships
  DROP CONSTRAINT billing_memberships_pkey;

ALTER TABLE billing_memberships
  ADD CONSTRAINT billing_memberships_pkey
    PRIMARY KEY (provider_mode, provider_membership_id);

ALTER TABLE billing_provider_events
  DROP CONSTRAINT billing_provider_events_pkey;

ALTER TABLE billing_provider_events
  ADD CONSTRAINT billing_provider_events_pkey
    PRIMARY KEY (provider, provider_mode, delivery_id);

DROP INDEX billing_checkout_sessions_user_status_idx;
CREATE INDEX billing_checkout_sessions_user_status_idx
  ON billing_checkout_sessions (
    provider_mode, clerk_user_id, status, expires_at DESC
  );

DROP INDEX billing_memberships_user_idx;
CREATE INDEX billing_memberships_user_idx
  ON billing_memberships (
    provider_mode, clerk_user_id, provider_updated_at DESC
  );

DROP INDEX billing_memberships_state_idx;
CREATE INDEX billing_memberships_state_idx
  ON billing_memberships (
    provider_mode, access_state, renewal_period_end
  );

DROP INDEX billing_provider_events_received_idx;
CREATE INDEX billing_provider_events_received_idx
  ON billing_provider_events (provider_mode, received_at DESC);

DROP INDEX billing_provider_events_state_idx;
CREATE INDEX billing_provider_events_state_idx
  ON billing_provider_events (
    provider_mode, processing_state, received_at
  );
