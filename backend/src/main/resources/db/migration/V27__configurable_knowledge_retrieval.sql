-- Per-knowledge-base retrieval settings. The runtime defaults remain in
-- application.yml, while these columns let administrators tune and persist the
-- retrieval strategy used by both the test console and Agent calls.
ALTER TABLE knowledge_base
    ADD COLUMN IF NOT EXISTS retrieval_top_k INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS retrieval_similarity_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    ADD COLUMN IF NOT EXISTS retrieval_mode VARCHAR(16) NOT NULL DEFAULT 'HYBRID',
    ADD COLUMN IF NOT EXISTS retrieval_lexical_weight DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    ADD COLUMN IF NOT EXISTS retrieval_fallback_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE knowledge_base
    ADD CONSTRAINT chk_knowledge_base_retrieval_top_k
        CHECK (retrieval_top_k BETWEEN 1 AND 20),
    ADD CONSTRAINT chk_knowledge_base_retrieval_threshold
        CHECK (retrieval_similarity_threshold BETWEEN 0 AND 1),
    ADD CONSTRAINT chk_knowledge_base_retrieval_mode
        CHECK (retrieval_mode IN ('DENSE', 'HYBRID')),
    ADD CONSTRAINT chk_knowledge_base_retrieval_lexical_weight
        CHECK (retrieval_lexical_weight BETWEEN 0 AND 1);

-- Older vector rows may reference a legacy profile even though the knowledge base
-- has since switched to an equivalent active profile. Re-label only rows whose
-- stored model and dimension already match the active profile.
UPDATE document_chunk_embedding_1024 e
SET embedding_profile_id = kb.embedding_profile_id,
    config_version = active.config_version
FROM document_chunk c
JOIN knowledge_document d ON d.id = c.document_id
JOIN knowledge_base kb ON kb.id = d.knowledge_base_id
JOIN embedding_profile active ON active.id = kb.embedding_profile_id
WHERE e.chunk_id = c.id
  AND c.embedding_model = active.model
  AND c.embedding_dimension = active.dimension
  AND e.embedding_profile_id <> kb.embedding_profile_id;

UPDATE document_chunk_embedding_1536 e
SET embedding_profile_id = kb.embedding_profile_id,
    config_version = active.config_version
FROM document_chunk c
JOIN knowledge_document d ON d.id = c.document_id
JOIN knowledge_base kb ON kb.id = d.knowledge_base_id
JOIN embedding_profile active ON active.id = kb.embedding_profile_id
WHERE e.chunk_id = c.id
  AND c.embedding_model = active.model
  AND c.embedding_dimension = active.dimension
  AND e.embedding_profile_id <> kb.embedding_profile_id;

UPDATE document_chunk_embedding_3072 e
SET embedding_profile_id = kb.embedding_profile_id,
    config_version = active.config_version
FROM document_chunk c
JOIN knowledge_document d ON d.id = c.document_id
JOIN knowledge_base kb ON kb.id = d.knowledge_base_id
JOIN embedding_profile active ON active.id = kb.embedding_profile_id
WHERE e.chunk_id = c.id
  AND c.embedding_model = active.model
  AND c.embedding_dimension = active.dimension
  AND e.embedding_profile_id <> kb.embedding_profile_id;
