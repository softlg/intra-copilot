-- S0.1: decouple original bytes from the indexed text.
--
-- Historically `knowledge_document.content` stored the full extracted text (and for
-- PDF the whole parsed document).  Re-indexing therefore depended on text that was
-- already lossy: page/table/heading structure was gone and the original bytes were
-- discarded right after the upload request finished.  Any change to the parsing or
-- chunking strategy required re-uploading the file by hand.
--
-- This migration keeps the parsed text as a read-only archive (so a rollback window
-- exists) and introduces `knowledge_document_storage`, which points at the original
-- bytes kept by the configured storage backend.  The `content` column is intentionally
-- NOT dropped here; a follow-up migration removes it once re-index through the new
-- path has been verified.

CREATE TABLE IF NOT EXISTS knowledge_document_content_archive (
  document_id VARCHAR(64) PRIMARY KEY REFERENCES knowledge_document(id) ON DELETE CASCADE,
  content TEXT,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO knowledge_document_content_archive (document_id, content)
SELECT id, content FROM knowledge_document WHERE content IS NOT NULL
ON CONFLICT (document_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS knowledge_document_storage (
  document_id VARCHAR(64) PRIMARY KEY REFERENCES knowledge_document(id) ON DELETE CASCADE,
  storage_backend VARCHAR(16) NOT NULL DEFAULT 'local',
  storage_key VARCHAR(512) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  byte_size BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_document_storage_sha ON knowledge_document_storage(sha256);
