ALTER TABLE agent_definition
  ADD COLUMN IF NOT EXISTS owner_type VARCHAR(16) NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS management_mode VARCHAR(32) NOT NULL DEFAULT 'USER_MANAGED',
  ADD COLUMN IF NOT EXISTS system_revision BIGINT NOT NULL DEFAULT 0;

UPDATE agent_definition
SET owner_type = 'SYSTEM',
    management_mode = 'SYSTEM_LOCKED'
WHERE system_agent = TRUE;

CREATE INDEX IF NOT EXISTS idx_agent_definition_management
  ON agent_definition (management_mode, enabled);

ALTER TABLE action_proposal
  ADD COLUMN IF NOT EXISTS postcondition TEXT,
  ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT FALSE;
