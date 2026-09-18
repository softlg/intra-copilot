package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.intra.copilot.model.KnowledgeBase;
import org.junit.jupiter.api.Test;

class KnowledgeRetrievalConfigTest {

    @Test
    void usesPerBaseConfigurationWhenPresent() {
        KnowledgeBase base = new KnowledgeBase();
        base.setRetrievalTopK(12);
        base.setRetrievalSimilarityThreshold(0.42);
        base.setRetrievalMode("DENSE");
        base.setRetrievalLexicalWeight(0.15);
        base.setRetrievalFallbackEnabled(false);

        KnowledgeService.RetrievalConfig config = resolve(base, null);

        assertEquals(12, config.topK());
        assertEquals(0.42, config.similarityThreshold());
        assertEquals("DENSE", config.mode());
        assertEquals(0.15, config.lexicalWeight());
        assertFalse(config.fallbackEnabled());
    }

    @Test
    void appliesTrialOverridesWithoutChangingStoredConfiguration() {
        KnowledgeBase base = new KnowledgeBase();
        base.setRetrievalTopK(8);
        base.setRetrievalSimilarityThreshold(0.60);
        base.setRetrievalMode("DENSE");
        base.setRetrievalLexicalWeight(0.10);
        base.setRetrievalFallbackEnabled(false);

        KnowledgeService.RetrievalConfig config =
                resolve(
                        base,
                        new KnowledgeService.RetrievalOverrides(3, 0.35, "HYBRID", 0.45, true));

        assertEquals(3, config.topK());
        assertEquals(0.35, config.similarityThreshold());
        assertEquals("HYBRID", config.mode());
        assertEquals(0.45, config.lexicalWeight());
        assertTrue(config.fallbackEnabled());
        assertEquals(8, base.getRetrievalTopK());
        assertEquals(0.60, base.getRetrievalSimilarityThreshold());
    }

    @Test
    void fallsBackToRuntimeDefaultsForLegacyRows() {
        KnowledgeBase base = new KnowledgeBase();
        base.setRetrievalTopK(null);
        base.setRetrievalSimilarityThreshold(null);
        base.setRetrievalMode(null);
        base.setRetrievalLexicalWeight(null);
        base.setRetrievalFallbackEnabled(null);

        KnowledgeService.RetrievalConfig config =
                KnowledgeService.resolveRetrievalConfig(base, null, 6, 0.50, "HYBRID", 0.30, true);

        assertEquals(6, config.topK());
        assertEquals(0.50, config.similarityThreshold());
        assertEquals("HYBRID", config.mode());
        assertEquals(0.30, config.lexicalWeight());
        assertTrue(config.fallbackEnabled());
    }

    private static KnowledgeService.RetrievalConfig resolve(
            KnowledgeBase base, KnowledgeService.RetrievalOverrides overrides) {
        return KnowledgeService.resolveRetrievalConfig(
                base, overrides, 5, 0.50, "HYBRID", 0.30, true);
    }
}
