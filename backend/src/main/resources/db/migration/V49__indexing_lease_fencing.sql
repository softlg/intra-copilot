ALTER TABLE indexing_job
  ADD COLUMN IF NOT EXISTS lease_token VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_indexing_job_lease
  ON indexing_job(status, lease_token);
