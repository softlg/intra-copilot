ALTER TABLE agent_definition
  ADD COLUMN IF NOT EXISTS planning_mode VARCHAR(16) NOT NULL DEFAULT 'AUTO';
ALTER TABLE agent_definition
  ADD COLUMN IF NOT EXISTS max_plan_steps INTEGER NOT NULL DEFAULT 6;

CREATE TABLE IF NOT EXISTS agent_plan (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  invocation_id VARCHAR(64) NOT NULL REFERENCES agent_invocation(id) ON DELETE CASCADE,
  correlation_id VARCHAR(64),
  parent_plan_id VARCHAR(64),
  route_agent_id VARCHAR(128),
  executor_agent_id VARCHAR(128),
  revision INTEGER NOT NULL DEFAULT 1,
  goal TEXT NOT NULL,
  summary TEXT,
  status VARCHAR(16) NOT NULL,
  planning_mode VARCHAR(16) NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_plan_conversation
  ON agent_plan(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_plan_invocation
  ON agent_plan(invocation_id, revision);
CREATE INDEX IF NOT EXISTS idx_agent_plan_correlation
  ON agent_plan(correlation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_plan_step (
  id VARCHAR(64) PRIMARY KEY,
  plan_id VARCHAR(64) NOT NULL REFERENCES agent_plan(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  title VARCHAR(256) NOT NULL,
  description TEXT,
  agent_id VARCHAR(128),
  tool_names TEXT NOT NULL DEFAULT '[]',
  depends_on TEXT NOT NULL DEFAULT '[]',
  success_criteria TEXT,
  status VARCHAR(16) NOT NULL,
  result_summary TEXT,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms BIGINT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_agent_plan_step_index UNIQUE (plan_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_plan_step_plan
  ON agent_plan_step(plan_id, step_index);

ALTER TABLE agent_invocation_event
  ADD COLUMN IF NOT EXISTS plan_id VARCHAR(64);
ALTER TABLE agent_invocation_event
  ADD COLUMN IF NOT EXISTS plan_step_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_agent_invocation_event_plan
  ON agent_invocation_event(plan_id, plan_step_id, sequence);
