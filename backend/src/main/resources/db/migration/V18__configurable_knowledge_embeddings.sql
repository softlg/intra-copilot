CREATE TABLE IF NOT EXISTS embedding_profile (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(160) NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension > 0),
  config_version VARCHAR(64) NOT NULL DEFAULT '1',
  max_input_tokens INTEGER,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_profile BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

INSERT INTO embedding_profile (id, name, provider, model, dimension, config_version, description, enabled, default_profile, created_at, updated_at)
VALUES ('system-default-embedding', '系统默认 Embedding', 'openai', 'text-embedding-3-small', 1536, '1', '系统内置默认配置', TRUE, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO embedding_profile (id, name, provider, model, dimension, config_version, description, enabled, default_profile, created_at, updated_at)
VALUES ('openai-large-embedding', 'OpenAI Embedding Large', 'openai', 'text-embedding-3-large', 3072, '1', 'OpenAI large embedding', TRUE, FALSE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO embedding_profile (id, name, provider, model, dimension, config_version, description, enabled, default_profile, created_at, updated_at)
VALUES ('local-bge-1024', '本地 BGE 1024', 'local', 'bge-large-zh', 1024, '1', '需要配置 embedding.providers.local', TRUE, FALSE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding_profile_id VARCHAR(64);
ALTER TABLE knowledge_base ADD CONSTRAINT fk_knowledge_base_embedding_profile
  FOREIGN KEY (embedding_profile_id) REFERENCES embedding_profile(id);

CREATE TABLE IF NOT EXISTS document_chunk_embedding_1024 (
  chunk_id VARCHAR(64) PRIMARY KEY REFERENCES document_chunk(id) ON DELETE CASCADE,
  knowledge_base_id VARCHAR(64) NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  embedding_profile_id VARCHAR(64) NOT NULL REFERENCES embedding_profile(id),
  config_version VARCHAR(64) NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunk_embedding_1024_hnsw ON document_chunk_embedding_1024 USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS document_chunk_embedding_1536 (
  chunk_id VARCHAR(64) PRIMARY KEY REFERENCES document_chunk(id) ON DELETE CASCADE,
  knowledge_base_id VARCHAR(64) NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  embedding_profile_id VARCHAR(64) NOT NULL REFERENCES embedding_profile(id),
  config_version VARCHAR(64) NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunk_embedding_1536_hnsw ON document_chunk_embedding_1536 USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS document_chunk_embedding_3072 (
  chunk_id VARCHAR(64) PRIMARY KEY REFERENCES document_chunk(id) ON DELETE CASCADE,
  knowledge_base_id VARCHAR(64) NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  embedding_profile_id VARCHAR(64) NOT NULL REFERENCES embedding_profile(id),
  config_version VARCHAR(64) NOT NULL,
  embedding vector(3072) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunk_embedding_3072_hnsw ON document_chunk_embedding_3072 USING hnsw (embedding vector_cosine_ops);

INSERT INTO document_chunk_embedding_1536 (chunk_id, knowledge_base_id, embedding_profile_id, config_version, embedding)
SELECT c.id, d.knowledge_base_id, 'system-default-embedding', '1', c.embedding
FROM document_chunk c JOIN knowledge_document d ON d.id = c.document_id
WHERE c.embedding IS NOT NULL
ON CONFLICT (chunk_id) DO NOTHING;
