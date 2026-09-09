-- S1.1: durable indexing queue.
--
-- Uploading used to run parse -> chunk -> embed inside the HTTP request thread, so a
-- 100-page PDF blocked a Tomcat worker for tens of seconds and a single throttled
-- embedding call failed the whole document.  Work is now enqueued here and drained by
-- `IndexingWorker`, which gives retries, progress and dead-lettering.
--
-- `parent_id` chains a REBUILD_BASE job to the per-document REINDEX jobs it expands to.
-- The partial unique index is the concurrency guard: at most one live job per
-- (document, type), so a double-click cannot index the same document twice.

CREATE TABLE IF NOT EXISTS indexing_job (
  id VARCHAR(64) PRIMARY KEY,
  parent_id VARCHAR(64),
  document_id VARCHAR(64),
  knowledge_base_id VARCHAR(64) NOT NULL,
  job_type VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
  progress SMALLINT NOT NULL DEFAULT 0,
  attempt SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 3,
  error TEXT,
  payload TEXT,
  worker_id VARCHAR(64),
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_indexing_job_pickup ON indexing_job(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_indexing_job_document ON indexing_job(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_indexing_job_parent ON indexing_job(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_indexing_job_active
  ON indexing_job (COALESCE(document_id, knowledge_base_id), job_type)
  WHERE status IN ('QUEUED', 'RUNNING', 'WAITING');

-- Jobs that exhausted every attempt land here instead of disappearing, so an operator
-- can inspect the payload and re-enqueue from the admin console.
CREATE TABLE IF NOT EXISTS indexing_dead_letter (
  id VARCHAR(64) PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  document_id VARCHAR(64),
  knowledge_base_id VARCHAR(64),
  job_type VARCHAR(32) NOT NULL,
  payload TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_indexing_dead_letter_created ON indexing_dead_letter(created_at DESC);
