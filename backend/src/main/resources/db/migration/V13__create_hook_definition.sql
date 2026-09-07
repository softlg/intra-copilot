CREATE TABLE IF NOT EXISTS hook_definition (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  phase VARCHAR(32) NOT NULL DEFAULT 'PRE_AGENT',
  rule_type VARCHAR(64) NOT NULL,
  rule_config TEXT NOT NULL DEFAULT '{}',
  failure_message TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hook_definition_enabled_priority
  ON hook_definition(enabled, priority);
