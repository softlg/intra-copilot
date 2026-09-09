CREATE TABLE IF NOT EXISTS message_attachment (
  id VARCHAR(64) PRIMARY KEY,
  message_id VARCHAR(64),
  storage_backend VARCHAR(32) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  filename VARCHAR(512) NOT NULL,
  content_type VARCHAR(160),
  byte_size BIGINT NOT NULL,
  is_image BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT fk_attachment_message FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachment_message ON message_attachment (message_id, sort_order);
