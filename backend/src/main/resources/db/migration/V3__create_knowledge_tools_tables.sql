CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_document (
  id VARCHAR(64) PRIMARY KEY,
  knowledge_base_id VARCHAR(64) NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  media_type VARCHAR(160),
  status VARCHAR(32) NOT NULL,
  content TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunk (
  id VARCHAR(64) PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL REFERENCES knowledge_document(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  page_number INTEGER,
  embedding vector(1536)
);
CREATE INDEX IF NOT EXISTS idx_document_chunk_document ON document_chunk(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunk_embedding ON document_chunk USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS tool_definition (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  type VARCHAR(32) NOT NULL,
  method VARCHAR(16),
  endpoint TEXT,
  parameter_schema TEXT NOT NULL DEFAULT '{}',
  allowed_domains TEXT NOT NULL DEFAULT '[]',
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_definition (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  tool_ids TEXT NOT NULL DEFAULT '[]',
  version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
