-- Decouple tool_definition MCP rows from the mcp_server_url string copy.
-- Introduce a real (logical) foreign key mcp_server_id and backfill it by joining on the
-- previously mirrored server_url across all servers, so the binding survives enable/disable
-- toggles. Then drop the redundant mcp_* columns; the server URL/transport/auth now live only
-- on the owning mcp_server row and are resolved via the FK at execution time.

ALTER TABLE tool_definition ADD COLUMN IF NOT EXISTS mcp_server_id VARCHAR(64);

UPDATE tool_definition t
SET mcp_server_id = s.id
FROM mcp_server s
WHERE t.type = 'MCP'
  AND t.mcp_server_url IS NOT NULL
  AND s.server_url = t.mcp_server_url;

ALTER TABLE tool_definition DROP COLUMN IF EXISTS mcp_server_url;
ALTER TABLE tool_definition DROP COLUMN IF EXISTS mcp_transport;
ALTER TABLE tool_definition DROP COLUMN IF EXISTS mcp_auth_env;
