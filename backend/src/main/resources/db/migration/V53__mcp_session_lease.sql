CREATE TABLE IF NOT EXISTS mcp_session_lease (
  server_id VARCHAR(64) PRIMARY KEY,
  owner_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_session_lease_expiry
  ON mcp_session_lease(expires_at);
