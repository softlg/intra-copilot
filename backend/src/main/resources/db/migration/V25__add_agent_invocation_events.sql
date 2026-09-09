-- Agent 执行事件追踪表：记录一次调用链路中的完整交互节点。
CREATE TABLE IF NOT EXISTS agent_invocation_event (
  id VARCHAR(64) PRIMARY KEY,
  invocation_id VARCHAR(64) NOT NULL REFERENCES agent_invocation(id) ON DELETE CASCADE,
  correlation_id VARCHAR(64),
  event_type VARCHAR(32) NOT NULL,
  event_name VARCHAR(128),
  status VARCHAR(16),
  payload JSON,
  duration_ms BIGINT,
  sequence INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_invocation_event_invocation
  ON agent_invocation_event(invocation_id, sequence);
CREATE INDEX IF NOT EXISTS idx_agent_invocation_event_correlation
  ON agent_invocation_event(correlation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_invocation_event_type
  ON agent_invocation_event(invocation_id, event_type);

-- 为 agent_invocation 补充模型与资源快照字段，避免每次 JOIN agent_definition。
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS agent_model VARCHAR(160);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS agent_temperature DOUBLE PRECISION;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS knowledge_base_ids TEXT;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS tool_ids TEXT;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS skill_ids TEXT;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS user_message TEXT;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS attachments TEXT;
