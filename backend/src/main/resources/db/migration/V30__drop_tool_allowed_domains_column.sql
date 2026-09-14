-- allowedDomains was a tool allow-list column that the backend never consumed
-- (no validator referenced it) and the admin UI never edited it. Drop it to keep the
-- schema aligned with ToolDefinition.
ALTER TABLE tool_definition DROP COLUMN IF EXISTS allowed_domains;
