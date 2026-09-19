CREATE TABLE IF NOT EXISTS runtime_lock (
  lock_key VARCHAR(255) PRIMARY KEY,
  owner_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_lock_expiry
  ON runtime_lock(expires_at);
