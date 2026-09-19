CREATE TABLE IF NOT EXISTS stream_cancellation (
  stream_id VARCHAR(128) PRIMARY KEY,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stream_cancellation_expiry
  ON stream_cancellation(expires_at);
