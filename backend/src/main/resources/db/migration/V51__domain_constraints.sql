DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_admin_user_role') THEN
    ALTER TABLE admin_user
      ADD CONSTRAINT ck_admin_user_role
      CHECK (role IN ('VIEWER', 'EDITOR', 'ADMIN', 'OWNER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_attachment_status') THEN
    ALTER TABLE message_attachment
      ADD CONSTRAINT ck_attachment_status
      CHECK (status IN ('PENDING', 'ATTACHED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_indexing_job_status') THEN
    ALTER TABLE indexing_job
      ADD CONSTRAINT ck_indexing_job_status
      CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'DEAD'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_indexing_job_progress') THEN
    ALTER TABLE indexing_job
      ADD CONSTRAINT ck_indexing_job_progress
      CHECK (progress BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_auth_rate_attempts') THEN
    ALTER TABLE auth_rate_limit
      ADD CONSTRAINT ck_auth_rate_attempts
      CHECK (attempts >= 0);
  END IF;
END $$;
