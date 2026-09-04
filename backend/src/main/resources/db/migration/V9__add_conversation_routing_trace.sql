ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS context_sent TEXT;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS response_content TEXT;
