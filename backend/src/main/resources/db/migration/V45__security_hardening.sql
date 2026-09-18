-- Security hardening: administrator roles/session invalidation, device
-- registration proof-of-possession challenges, and attachment ownership.

ALTER TABLE admin_user
  ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS session_version BIGINT NOT NULL DEFAULT 0;

UPDATE admin_user
SET role = CASE
  WHEN LOWER(username) = 'admin' THEN 'OWNER'
  ELSE 'ADMIN'
END
WHERE role IS NULL OR role = '' OR role = 'ADMIN';

CREATE TABLE IF NOT EXISTS device_registration_challenge (
  challenge_id VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  source VARCHAR(64) NOT NULL,
  nonce VARCHAR(128) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_registration_challenge_expiry
  ON device_registration_challenge (expires_at, consumed_at);

ALTER TABLE message_attachment
  ADD COLUMN IF NOT EXISTS owner_source VARCHAR(64),
  ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE message_attachment
SET owner_source = COALESCE(owner_source, 'extension'),
    owner_user_id = COALESCE(owner_user_id, 'anonymous'),
    status = CASE
      WHEN message_id IS NULL THEN 'PENDING'
      ELSE 'ATTACHED'
    END,
    expires_at = CASE
      WHEN message_id IS NULL AND expires_at IS NULL
        THEN created_at + INTERVAL '24 hours'
      ELSE expires_at
    END
WHERE owner_source IS NULL
   OR owner_user_id IS NULL
   OR status IS NULL
   OR (message_id IS NULL AND expires_at IS NULL);

-- Existing linked attachments inherit the conversation owner instead of the
-- anonymous fallback, otherwise historical attachments would become unreadable.
UPDATE message_attachment a
SET owner_source = c.source,
    owner_user_id = c.user_id
FROM message m
JOIN conversation c ON c.id = m.conversation_id
WHERE a.message_id = m.id;

ALTER TABLE message_attachment
  ALTER COLUMN owner_source SET NOT NULL,
  ALTER COLUMN owner_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachment_owner_status
  ON message_attachment (owner_source, owner_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachment_pending_expiry
  ON message_attachment (status, expires_at)
  WHERE status = 'PENDING';
