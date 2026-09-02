CREATE TABLE IF NOT EXISTS agent_definition (
  id VARCHAR(128) PRIMARY KEY,
  display_name VARCHAR(160) NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  supports_browser_actions BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 100,
  model VARCHAR(160),
  temperature DOUBLE PRECISION,
  knowledge_base_ids TEXT NOT NULL DEFAULT '[]',
  tool_ids TEXT NOT NULL DEFAULT '[]',
  skill_ids TEXT NOT NULL DEFAULT '[]',
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_invocation (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64),
  requested_agent_id VARCHAR(128),
  selected_agent_id VARCHAR(128),
  route_reason TEXT,
  confidence DOUBLE PRECISION,
  route_source VARCHAR(32),
  duration_ms BIGINT,
  error TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_invocation_conversation
  ON agent_invocation (conversation_id, created_at);
