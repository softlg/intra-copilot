package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.repo.EmbeddingProfileRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class EmbeddingProfileServiceTest {
    private final EmbeddingProfileRepository profiles = mock(EmbeddingProfileRepository.class);
    private final KnowledgeBaseRepository bases = mock(KnowledgeBaseRepository.class);
    private final EmbeddingProfileService service =
            new EmbeddingProfileService(profiles, bases, "openai", "default-model", 1024);

    @Test
    void savesCustomConnectionDetailsAndResolvesThemForEmbedding() {
        KnowledgeBase base = base();
        when(bases.findById(base.getId())).thenReturn(Optional.of(base));

        EmbeddingProfile resolved =
                service.applyConfig(
                        base.getId(),
                        new EmbeddingProfileService.EmbeddingConfigRequest(
                                false,
                                "custom",
                                "https://embedding.example.com/v1",
                                "custom-embedding",
                                "secret-key",
                                1536,
                                null));

        assertFalse(base.getUseSystemEmbedding());
        assertEquals("https://embedding.example.com/v1", base.getEmbeddingBaseUrl());
        assertEquals("custom-embedding", base.getEmbeddingModel());
        assertEquals("secret-key", base.getEmbeddingApiKey());
        assertEquals(1536, base.getEmbeddingDimension());
        assertEquals("https://embedding.example.com/v1", resolved.getBaseUrl());
        assertEquals("secret-key", resolved.getApiKey());
    }

    @Test
    void keepsExistingApiKeyWhenTheEditFormLeavesItBlank() {
        KnowledgeBase base = customBase();
        base.setEmbeddingApiKey("existing-key");
        when(bases.findById(base.getId())).thenReturn(Optional.of(base));

        service.applyConfig(
                base.getId(),
                new EmbeddingProfileService.EmbeddingConfigRequest(
                        false,
                        "custom",
                        "https://new.example.com/v1",
                        "new-model",
                        null,
                        1536,
                        null));

        assertEquals("existing-key", base.getEmbeddingApiKey());
        assertEquals("https://new.example.com/v1", base.getEmbeddingBaseUrl());
        assertEquals("new-model", base.getEmbeddingModel());
    }

    @Test
    void requiresAnApiKeyForTheFirstCustomConfiguration() {
        KnowledgeBase base = base();
        when(bases.findById(base.getId())).thenReturn(Optional.of(base));

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                service.applyConfig(
                                        base.getId(),
                                        new EmbeddingProfileService.EmbeddingConfigRequest(
                                                false,
                                                "custom",
                                                "https://embedding.example.com/v1",
                                                "custom-embedding",
                                                null,
                                                1536,
                                                null)));

        assertEquals("首次配置自定义模型时 API Key 不能为空", error.getMessage());
    }

    @Test
    void switchingBackToSystemClearsCustomConnectionDetails() {
        KnowledgeBase base = customBase();
        base.setEmbeddingApiKey("secret-key");
        when(bases.findById(base.getId())).thenReturn(Optional.of(base));

        service.applyConfig(
                base.getId(),
                new EmbeddingProfileService.EmbeddingConfigRequest(
                        true, null, null, null, null, null, null));

        assertEquals(Boolean.TRUE, base.getUseSystemEmbedding());
        assertNull(base.getEmbeddingProvider());
        assertNull(base.getEmbeddingBaseUrl());
        assertNull(base.getEmbeddingModel());
        assertNull(base.getEmbeddingApiKey());
        assertNull(base.getEmbeddingDimension());
    }

    @Test
    void apiKeysAreNeverSerialized() throws Exception {
        KnowledgeBase base = customBase();
        base.setEmbeddingApiKey("knowledge-base-secret");
        EmbeddingProfile profile = new EmbeddingProfile();
        profile.setApiKey("profile-secret");

        ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        String baseJson = json.writeValueAsString(base);
        String profileJson = json.writeValueAsString(profile);

        assertFalse(baseJson.contains("knowledge-base-secret"));
        assertFalse(baseJson.contains("embeddingApiKey"));
        assertFalse(profileJson.contains("profile-secret"));
        assertFalse(profileJson.contains("apiKey"));
    }

    private KnowledgeBase base() {
        KnowledgeBase base = new KnowledgeBase();
        base.setName("测试知识库");
        return base;
    }

    private KnowledgeBase customBase() {
        KnowledgeBase base = base();
        base.setUseSystemEmbedding(false);
        base.setEmbeddingProvider("custom");
        base.setEmbeddingBaseUrl("https://embedding.example.com/v1");
        base.setEmbeddingModel("custom-embedding");
        base.setEmbeddingDimension(1536);
        return base;
    }
}
