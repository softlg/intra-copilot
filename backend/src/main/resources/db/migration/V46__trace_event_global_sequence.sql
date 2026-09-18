-- A database sequence makes sequence_global collision-free across concurrent
-- instances and avoids SELECT MAX(...) + 1 on every trace event.
CREATE SEQUENCE IF NOT EXISTS agent_invocation_event_global_seq;

SELECT setval(
  'agent_invocation_event_global_seq',
  COALESCE((SELECT MAX(sequence_global) FROM agent_invocation_event), 0) + 1,
  false
);

ALTER TABLE agent_invocation_event
  ALTER COLUMN sequence_global SET DEFAULT nextval('agent_invocation_event_global_seq');
