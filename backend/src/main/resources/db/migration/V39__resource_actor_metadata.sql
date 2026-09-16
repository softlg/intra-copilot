-- Global resources are shared by all administrators. Keep the original creator
-- and the most recent editor for accountability without introducing RBAC.

ALTER TABLE agent_definition
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system';
ALTER TABLE agent_definition
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) NOT NULL DEFAULT 'system';

ALTER TABLE tool_definition
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system';
ALTER TABLE tool_definition
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) NOT NULL DEFAULT 'system';

ALTER TABLE mcp_server
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system';
ALTER TABLE mcp_server
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) NOT NULL DEFAULT 'system';

ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system';

ALTER TABLE hook_definition
  ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system';
