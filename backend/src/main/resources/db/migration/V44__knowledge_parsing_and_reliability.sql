-- Keep the previous searchable generation available while a rebuild runs, and
-- persist enough structure for table/image/attachment-aware retrieval.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE indexing_job
    ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

UPDATE indexing_job
SET heartbeat_at = COALESCE(started_at, created_at)
WHERE status = 'RUNNING' AND heartbeat_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_indexing_job_heartbeat
    ON indexing_job(status, heartbeat_at);

ALTER TABLE knowledge_document
    ADD COLUMN IF NOT EXISTS page_count INTEGER,
    ADD COLUMN IF NOT EXISTS block_count INTEGER,
    ADD COLUMN IF NOT EXISTS table_count INTEGER,
    ADD COLUMN IF NOT EXISTS image_count INTEGER,
    ADD COLUMN IF NOT EXISTS attachment_count INTEGER,
    ADD COLUMN IF NOT EXISTS extracted_chars BIGINT,
    ADD COLUMN IF NOT EXISTS parse_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE document_chunk
    ADD COLUMN IF NOT EXISTS section_path VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS block_type VARCHAR(32) NOT NULL DEFAULT 'TEXT',
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS token_count INTEGER,
    ADD COLUMN IF NOT EXISTS content_hash CHAR(64);

CREATE INDEX IF NOT EXISTS idx_document_chunk_content_trgm
    ON document_chunk USING gin (lower(content) gin_trgm_ops);

CREATE TABLE IF NOT EXISTS knowledge_document_asset (
    id VARCHAR(64) PRIMARY KEY,
    document_id VARCHAR(64) NOT NULL REFERENCES knowledge_document(id) ON DELETE CASCADE,
    asset_kind VARCHAR(32) NOT NULL,
    name VARCHAR(255),
    media_type VARCHAR(160),
    storage_backend VARCHAR(16),
    storage_key VARCHAR(512),
    sha256 CHAR(64),
    byte_size BIGINT,
    page_number INTEGER,
    section_path VARCHAR(1000),
    extracted_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    job_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_asset_document
    ON knowledge_document_asset(document_id, page_number, asset_kind);
CREATE INDEX IF NOT EXISTS idx_knowledge_document_asset_job
    ON knowledge_document_asset(job_id);
