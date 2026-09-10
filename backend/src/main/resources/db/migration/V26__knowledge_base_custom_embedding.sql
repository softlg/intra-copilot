-- Allow each knowledge base to optionally override the system default embedding model
-- with a user-supplied provider/model/dimension instead of picking a central profile.
ALTER TABLE knowledge_base
    ADD COLUMN use_system_embedding BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE knowledge_base
    ADD COLUMN embedding_provider VARCHAR(120);

ALTER TABLE knowledge_base
    ADD COLUMN embedding_model VARCHAR(255);

ALTER TABLE knowledge_base
    ADD COLUMN embedding_dimension INT;
