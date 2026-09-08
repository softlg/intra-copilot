ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(64);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS parent_invocation_id VARCHAR(64);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS sequence INTEGER;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS depth INTEGER;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS agent_role VARCHAR(16);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS decision_mode VARCHAR(16);
CREATE INDEX IF NOT EXISTS idx_agent_invocation_correlation ON agent_invocation(correlation_id, sequence);
