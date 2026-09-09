package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class EmbeddingSchemaTest {

    private final EmbeddingSchema schema = new EmbeddingSchema();

    @Test
    void mapsSupportedDimensions() {
        assertEquals("document_chunk_embedding_1024", schema.tableFor(1024));
        assertEquals("document_chunk_embedding_1536", schema.tableFor(1536));
        assertEquals("document_chunk_embedding_3072", schema.tableFor(3072));
    }

    @Test
    void usesHalfvecAboveTheHnswVectorLimit() {
        assertEquals("?::vector", schema.castFor(1536));
        assertEquals("?::halfvec", schema.castFor(3072));
    }

    @Test
    void rejectsUnsupportedDimensions() {
        assertFalse(schema.supports(768));
        assertThrows(IllegalArgumentException.class, () -> schema.tableFor(768));
    }

    @Test
    void supportedDimensionsAreConsistent() {
        for (int dimension : new int[]{1024, 1536, 3072}) {
            assertTrue(schema.supports(dimension));
        }
    }
}
