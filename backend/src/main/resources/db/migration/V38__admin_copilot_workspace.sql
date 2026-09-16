-- Persistent administrator identities and the AI workspace used to author,
-- validate, and apply Agent/resource changes.

CREATE TABLE IF NOT EXISTS admin_user (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  display_name VARCHAR(160),
  password_hash VARCHAR(512) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_user_username
  ON admin_user (LOWER(username));

CREATE TABLE IF NOT EXISTS admin_copilot_session (
  id VARCHAR(64) PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL REFERENCES admin_user(id),
  title VARCHAR(200) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  current_agent_id VARCHAR(128),
  state_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_copilot_session_owner
  ON admin_copilot_session (admin_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_copilot_message (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES admin_copilot_session(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  payload_json TEXT,
  model VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_copilot_message_session
  ON admin_copilot_message (session_id, created_at);

CREATE TABLE IF NOT EXISTS admin_copilot_proposal (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES admin_copilot_session(id) ON DELETE CASCADE,
  admin_user_id VARCHAR(64) NOT NULL REFERENCES admin_user(id),
  kind VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  payload_json TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'READY',
  applied_target_type VARCHAR(32),
  applied_target_id VARCHAR(128),
  apply_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_copilot_proposal_session
  ON admin_copilot_proposal (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_agent_validation_run (
  id VARCHAR(64) PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL REFERENCES admin_user(id),
  agent_id VARCHAR(128) NOT NULL,
  agent_version BIGINT NOT NULL DEFAULT 0,
  config_hash VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  report_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_validation_agent
  ON admin_agent_validation_run (agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_agent_validation_case (
  id VARCHAR(64) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL REFERENCES admin_agent_validation_run(id) ON DELETE CASCADE,
  case_index INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  input_text TEXT NOT NULL,
  page_context TEXT,
  expected TEXT NOT NULL,
  actual_response TEXT,
  passed BOOLEAN,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_validation_case_run
  ON admin_agent_validation_case (run_id, case_index);

CREATE TABLE IF NOT EXISTS admin_operation_audit (
  id VARCHAR(64) PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL REFERENCES admin_user(id),
  actor_username VARCHAR(100) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32),
  target_id VARCHAR(128),
  source VARCHAR(32) NOT NULL,
  session_id VARCHAR(64),
  payload_json TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_operation_audit_created
  ON admin_operation_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_operation_audit_target
  ON admin_operation_audit (target_type, target_id, created_at DESC);
