-- One chat attempt is grouped by trace_id. Retries of the same user turn keep turn_id
-- and increase attempt_no, while every agent/LLM/tool span can be ordered globally.
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS trace_id VARCHAR(64);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS turn_id VARCHAR(64);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS attempt_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS request_id VARCHAR(96);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS parent_span_id VARCHAR(64);
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS span_type VARCHAR(32) NOT NULL DEFAULT 'AGENT';
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE agent_invocation
SET trace_id = COALESCE(trace_id, correlation_id),
    turn_id = COALESCE(turn_id, correlation_id),
    started_at = COALESCE(started_at, created_at)
WHERE trace_id IS NULL OR turn_id IS NULL OR started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_invocation_trace
  ON agent_invocation(trace_id, sequence, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_invocation_turn
  ON agent_invocation(turn_id, attempt_no, created_at);

ALTER TABLE agent_invocation_event ADD COLUMN IF NOT EXISTS trace_id VARCHAR(64);
ALTER TABLE agent_invocation_event ADD COLUMN IF NOT EXISTS turn_id VARCHAR(64);
ALTER TABLE agent_invocation_event ADD COLUMN IF NOT EXISTS attempt_no INTEGER;
ALTER TABLE agent_invocation_event ADD COLUMN IF NOT EXISTS span_id VARCHAR(64);
ALTER TABLE agent_invocation_event ADD COLUMN IF NOT EXISTS parent_event_id VARCHAR(64);
ALTER TABLE agent_invocation_event ADD COLUMN IF NOT EXISTS causation_event_id VARCHAR(64);
ALTER TABLE agent_invocation_event ADD COLUMN IF NOT EXISTS sequence_global BIGINT;

UPDATE agent_invocation_event e
SET trace_id = COALESCE(e.trace_id, i.trace_id, e.correlation_id),
    turn_id = COALESCE(e.turn_id, i.turn_id, e.correlation_id),
    attempt_no = COALESCE(e.attempt_no, i.attempt_no, 1),
    span_id = COALESCE(e.span_id, e.invocation_id)
FROM agent_invocation i
WHERE e.invocation_id = i.id
  AND (e.trace_id IS NULL OR e.turn_id IS NULL OR e.attempt_no IS NULL OR e.span_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_agent_invocation_event_trace
  ON agent_invocation_event(trace_id, sequence_global, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_invocation_event_parent
  ON agent_invocation_event(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_agent_invocation_event_causation
  ON agent_invocation_event(causation_event_id);

ALTER TABLE action_proposal ADD COLUMN IF NOT EXISTS invocation_id VARCHAR(64);
ALTER TABLE action_proposal ADD COLUMN IF NOT EXISTS trace_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_action_invocation
  ON action_proposal(invocation_id);
CREATE INDEX IF NOT EXISTS idx_action_trace
  ON action_proposal(trace_id);
