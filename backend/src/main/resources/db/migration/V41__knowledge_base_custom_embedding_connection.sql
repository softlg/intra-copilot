-- Store per-knowledge-base connection details when the system embedding
-- configuration is disabled. The API key is never returned by admin APIs.
ALTER TABLE knowledge_base
    ADD COLUMN IF NOT EXISTS embedding_base_url VARCHAR(1000);

ALTER TABLE knowledge_base
    ADD COLUMN IF NOT EXISTS embedding_api_key VARCHAR(2048);
