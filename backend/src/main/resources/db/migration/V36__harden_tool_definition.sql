-- Keep the model-facing function name separate from the MCP server's original
-- tool name so unsafe names can be normalized without changing the remote call.
ALTER TABLE tool_definition ADD COLUMN IF NOT EXISTS remote_name TEXT;

-- HTTP tools may reference a secret from the process environment instead of
-- storing credentials in the database.
ALTER TABLE tool_definition ADD COLUMN IF NOT EXISTS auth_header_name VARCHAR(160);
ALTER TABLE tool_definition ADD COLUMN IF NOT EXISTS auth_env VARCHAR(160);
ALTER TABLE tool_definition ADD COLUMN IF NOT EXISTS auth_scheme VARCHAR(64);

UPDATE tool_definition
SET remote_name = name
WHERE type = 'MCP'
  AND remote_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_tool_definition_lower_name
    ON tool_definition (LOWER(name));
