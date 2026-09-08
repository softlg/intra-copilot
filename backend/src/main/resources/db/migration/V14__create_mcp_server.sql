CREATE TABLE IF NOT EXISTS mcp_server (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  server_url TEXT NOT NULL,
  transport VARCHAR(32) NOT NULL DEFAULT 'STREAMABLE_HTTP',
  auth_env VARCHAR(160),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'UNKNOWN',
  interface_count INTEGER NOT NULL DEFAULT 0,
  interfaces_json TEXT NOT NULL DEFAULT '[]',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  last_latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_server_enabled ON mcp_server(enabled);
