ALTER TABLE agent_definition
  ADD COLUMN IF NOT EXISTS system_agent BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE agent_definition
SET system_agent = TRUE
WHERE id IN ('assistant', 'diagnosis', 'tms-manual');
