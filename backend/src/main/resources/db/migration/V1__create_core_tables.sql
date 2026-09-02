CREATE TABLE IF NOT EXISTS conversation (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS message (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  agent_id VARCHAR(128),
  context_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT fk_message_conversation FOREIGN KEY (conversation_id) REFERENCES conversation(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_conversation_created
  ON message (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS action_proposal (
  action_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  target TEXT,
  arguments TEXT,
  reason TEXT,
  risk VARCHAR(32),
  expires_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL,
  result TEXT,
  CONSTRAINT fk_action_conversation FOREIGN KEY (conversation_id) REFERENCES conversation(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_action_conversation ON action_proposal (conversation_id);
