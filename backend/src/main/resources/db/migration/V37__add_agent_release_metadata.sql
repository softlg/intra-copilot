ALTER TABLE agent_config_version ADD COLUMN IF NOT EXISTS published_by VARCHAR(128);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS agent_version BIGINT;
