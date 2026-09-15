ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS source VARCHAR(64),
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS reason_code VARCHAR(32),
  ADD COLUMN IF NOT EXISTS reason_text TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(16),
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE agent_feedback feedback
SET
  source = COALESCE(feedback.source, conversation.source, 'extension'),
  user_id = COALESCE(feedback.user_id, conversation.user_id, 'anonymous')
FROM conversation
WHERE feedback.session_id = conversation.id
  AND (feedback.source IS NULL OR feedback.user_id IS NULL);

UPDATE agent_feedback
SET
  source = COALESCE(source, 'legacy'),
  user_id = COALESCE(user_id, 'legacy:' || id),
  reason_code = CASE
    WHEN reason_code IS NULL AND comment IS NOT NULL AND BTRIM(comment) <> '' THEN 'OTHER'
    ELSE reason_code
  END,
  reason_text = COALESCE(reason_text, NULLIF(BTRIM(comment), '')),
  status = COALESCE(status, 'ACTIVE'),
  rated_at = COALESCE(rated_at, created_at),
  updated_at = COALESCE(updated_at, created_at);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY source, user_id, message_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS row_number
  FROM agent_feedback
  WHERE message_id IS NOT NULL
)
DELETE FROM agent_feedback
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_feedback_vote
  ON agent_feedback(source, user_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_feedback_active_rated
  ON agent_feedback(status, rated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_agent_status
  ON agent_feedback(agent_id, status, rated_at DESC);
