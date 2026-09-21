ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS execution_token VARCHAR(64);
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS worker_heartbeat_at TIMESTAMPTZ;
ALTER TABLE browser_task
  ADD COLUMN IF NOT EXISTS execution_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_browser_task_worker_recovery
  ON browser_task(status, worker_heartbeat_at, updated_at);
