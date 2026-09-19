CREATE TABLE IF NOT EXISTS auth_rate_limit (
  bucket_key VARCHAR(128) PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_updated
  ON auth_rate_limit(updated_at);
