CREATE TABLE extension_pairing_grants (
  id uuid PRIMARY KEY,
  code_hash text NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  nonce_hash text NOT NULL CHECK (length(nonce_hash) = 64),
  clerk_user_id text NOT NULL,
  clerk_session_id text NOT NULL,
  extension_id text NOT NULL CHECK (extension_id ~ '^[a-p]{32}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX extension_pairing_grants_expiry_idx
  ON extension_pairing_grants (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE extension_device_sessions (
  id uuid PRIMARY KEY,
  clerk_user_id text NOT NULL,
  clerk_session_id text NOT NULL,
  extension_id text NOT NULL CHECK (extension_id ~ '^[a-p]{32}$'),
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  previous_token_version integer,
  previous_valid_until timestamptz,
  issued_at timestamptz NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (access_expires_at > issued_at),
  CHECK (refresh_expires_at > access_expires_at)
);

CREATE INDEX extension_device_sessions_user_idx
  ON extension_device_sessions (clerk_user_id, revoked_at, refresh_expires_at DESC);

CREATE INDEX extension_device_sessions_clerk_session_idx
  ON extension_device_sessions (clerk_session_id, revoked_at);

CREATE INDEX extension_device_sessions_expiry_idx
  ON extension_device_sessions (refresh_expires_at)
  WHERE revoked_at IS NULL;
