CREATE TABLE runtime_safety_latches (
  latch_name text PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('enabled', 'disabled')),
  consecutive_failures integer NOT NULL DEFAULT 0
    CHECK (consecutive_failures >= 0),
  disabled_at timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'enabled' AND disabled_at IS NULL) OR
    (state = 'disabled' AND disabled_at IS NOT NULL)
  )
);

INSERT INTO runtime_safety_latches (
  latch_name, state, consecutive_failures
) VALUES ('xai_zdr', 'enabled', 0)
ON CONFLICT (latch_name) DO NOTHING;
