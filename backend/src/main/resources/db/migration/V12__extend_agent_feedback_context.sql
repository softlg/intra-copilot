ALTER TABLE agent_feedback
  ADD COLUMN IF NOT EXISTS message_content TEXT,
  ADD COLUMN IF NOT EXISTS user_message TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_feedback_rating_created
  ON agent_feedback(rating, created_at);
