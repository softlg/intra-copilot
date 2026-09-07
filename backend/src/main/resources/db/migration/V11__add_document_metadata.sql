ALTER TABLE knowledge_document
  ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

CREATE INDEX IF NOT EXISTS idx_knowledge_document_base_hash
  ON knowledge_document(knowledge_base_id, file_hash);
