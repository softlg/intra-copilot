CREATE TABLE IF NOT EXISTS agent_feedback (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64),
  message_id VARCHAR(64),
  message_index INTEGER,
  agent_id VARCHAR(128),
  rating VARCHAR(16) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_agent ON agent_feedback(agent_id, created_at);
