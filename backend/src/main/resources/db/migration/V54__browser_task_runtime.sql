CREATE TABLE IF NOT EXISTS browser_task (
  task_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64),
  owner_user_id VARCHAR(160) NOT NULL,
  capability VARCHAR(128) NOT NULL,
  interaction_mode VARCHAR(32) NOT NULL,
  runtime_kind VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  goal TEXT NOT NULL,
  start_url VARCHAR(2048),
  business_context TEXT NOT NULL DEFAULT '{}',
  constraints TEXT NOT NULL DEFAULT '{}',
  success_criteria TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  error TEXT,
  max_steps INTEGER NOT NULL DEFAULT 10,
  steps_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  lock_version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_browser_task_owner_status
  ON browser_task(owner_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_task_conversation
  ON browser_task(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS browser_task_event (
  event_id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL REFERENCES browser_task(task_id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  status VARCHAR(32),
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_task_event_task
  ON browser_task_event(task_id, sequence_no);
