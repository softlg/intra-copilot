CREATE TABLE IF NOT EXISTS storage_delete_outbox (
  id VARCHAR(64) PRIMARY KEY,
  storage_backend VARCHAR(32) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storage_delete_outbox_pickup
  ON storage_delete_outbox(next_attempt_at, created_at)
  WHERE completed_at IS NULL;
