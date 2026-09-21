ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS protocol_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS allowed_origins TEXT NOT NULL DEFAULT '[]';
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS lease_runtime_instance_id VARCHAR(160);
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS lease_token_hash VARCHAR(64);
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS runtime_version VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_browser_task_owner_idempotency
  ON browser_task(owner_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS browser_runtime_instance (
  instance_id VARCHAR(160) PRIMARY KEY,
  owner_user_id VARCHAR(160) NOT NULL,
  runtime_kind VARCHAR(32) NOT NULL,
  protocol_version INTEGER NOT NULL,
  runtime_version VARCHAR(64),
  supported_actions TEXT NOT NULL DEFAULT '[]',
  interaction_modes TEXT NOT NULL DEFAULT '[]',
  current_url VARCHAR(2048),
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_runtime_instance_presence
  ON browser_runtime_instance(owner_user_id, runtime_kind, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS browser_task_command (
  command_id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL REFERENCES browser_task(task_id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  action_json TEXT NOT NULL,
  action_type VARCHAR(48) NOT NULL,
  status VARCHAR(32) NOT NULL,
  runtime_instance_id VARCHAR(160),
  lease_token_hash VARCHAR(64),
  result_json TEXT,
  observation_json TEXT,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_browser_task_command_sequence
  ON browser_task_command(task_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_browser_task_command_pending
  ON browser_task_command(task_id, status, sequence_no);
CREATE INDEX IF NOT EXISTS idx_browser_task_command_expiry
  ON browser_task_command(status, expires_at);
