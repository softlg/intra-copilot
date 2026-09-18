ALTER TABLE admin_copilot_session
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

DROP INDEX IF EXISTS idx_admin_copilot_session_owner;

CREATE INDEX IF NOT EXISTS idx_admin_copilot_session_owner
  ON admin_copilot_session (admin_user_id, pinned DESC, updated_at DESC);
