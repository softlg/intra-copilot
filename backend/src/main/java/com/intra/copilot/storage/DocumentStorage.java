package com.intra.copilot.storage;

import java.io.IOException;

/**
 * Keeps the original bytes of an uploaded document so parsing and chunking can be replayed. The
 * database only stores a pointer; the bytes live behind this interface, which lets a deployment
 * move from the local disk to S3/MinIO without touching the indexing pipeline.
 */
public interface DocumentStorage {

    /** Backend identifier persisted in {@code knowledge_document_storage.storage_backend}. */
    String backend();

    StoredObject store(String baseId, String documentId, String filename, byte[] bytes)
            throws IOException;

    byte[] load(String storageKey) throws IOException;

    void delete(String storageKey) throws IOException;

    record StoredObject(String key, String sha256, long byteSize) {}
}
