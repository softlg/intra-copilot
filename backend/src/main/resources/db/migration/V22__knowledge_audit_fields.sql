-- S0.2: audit fields, chunk provenance and the audit log.
--
-- Every maintenance action (upload / reindex / rebuild / delete / profile change)
-- is recorded in `knowledge_audit_log` so a knowledge base can be operated by more
-- than one person.  `document_chunk` also remembers which embedding model, dimension
-- and chunk strategy produced it, which is what makes "which chunks are stale after
-- switching the embedding profile" a query instead of a guess.

ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS created_by VARCHAR(64);
ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS updated_by VARCHAR(64);
ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS parser VARCHAR(32);
ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS chunk_strategy VARCHAR(32);
ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(160);
ALTER TABLE knowledge_document ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER;

ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS created_by VARCHAR(64);
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS updated_by VARCHAR(64);
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'READY';
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS chunk_strategy VARCHAR(32) NOT NULL DEFAULT 'structured';

ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(160);
ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER;
ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS chunk_strategy VARCHAR(32);
ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS job_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_document_chunk_job ON document_chunk(job_id);

-- Backfill provenance for chunks created before this migration: they were produced by
-- the built-in structured splitter and the seeded 1536-dimension default profile.
UPDATE document_chunk SET chunk_strategy = 'structured' WHERE chunk_strategy IS NULL;

CREATE TABLE IF NOT EXISTS knowledge_audit_log (
  id VARCHAR(64) PRIMARY KEY,
  knowledge_base_id VARCHAR(64),
  document_id VARCHAR(64),
  actor VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_audit_base_created ON knowledge_audit_log(knowledge_base_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_audit_document ON knowledge_audit_log(document_id);
