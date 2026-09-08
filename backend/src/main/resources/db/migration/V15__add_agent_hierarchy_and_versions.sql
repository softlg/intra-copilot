ALTER TABLE agent_definition ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'DOMAIN';
ALTER TABLE agent_definition ADD COLUMN IF NOT EXISTS parent_agent_id VARCHAR(128);
ALTER TABLE agent_definition ADD COLUMN IF NOT EXISTS handling_mode VARCHAR(16) NOT NULL DEFAULT 'AUTO';
ALTER TABLE agent_definition ADD COLUMN IF NOT EXISTS return_mode VARCHAR(24) NOT NULL DEFAULT 'CHILD_DIRECT';
ALTER TABLE agent_definition ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE agent_definition ADD COLUMN IF NOT EXISTS published_version BIGINT NOT NULL DEFAULT 0;
UPDATE agent_definition SET role = 'MAIN' WHERE id = 'route-copilot';
UPDATE agent_definition SET role = 'GENERAL' WHERE id = 'assistant';
UPDATE agent_definition SET role = 'DOMAIN' WHERE role IS NULL OR role = '';

CREATE TABLE IF NOT EXISTS agent_config_version (
  id VARCHAR(64) PRIMARY KEY,
  agent_id VARCHAR(128) NOT NULL REFERENCES agent_definition(id) ON DELETE CASCADE,
  version BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL,
  snapshot TEXT NOT NULL,
  release_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(agent_id, version)
);
CREATE INDEX IF NOT EXISTS idx_agent_config_version_agent ON agent_config_version(agent_id, version DESC);

CREATE TABLE IF NOT EXISTS agent_child_binding (
  id VARCHAR(64) PRIMARY KEY,
  parent_agent_id VARCHAR(128) NOT NULL REFERENCES agent_definition(id) ON DELETE CASCADE,
  child_agent_id VARCHAR(128) NOT NULL REFERENCES agent_definition(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  routing_rule TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(parent_agent_id, child_agent_id),
  CHECK(parent_agent_id <> child_agent_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_child_parent ON agent_child_binding(parent_agent_id, priority);
