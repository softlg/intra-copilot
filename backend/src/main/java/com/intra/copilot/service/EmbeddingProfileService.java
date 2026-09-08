package com.intra.copilot.service;

import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.repo.EmbeddingProfileRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class EmbeddingProfileService {
    private final EmbeddingProfileRepository profiles;
    private final KnowledgeBaseRepository bases;
    private final String defaultProvider;
    private final String defaultModel;
    private final int defaultDimension;

    public EmbeddingProfileService(EmbeddingProfileRepository profiles, KnowledgeBaseRepository bases,
            @Value("${embedding.default-provider:openai}") String defaultProvider,
            @Value("${spring.ai.openai.embedding.options.model:text-embedding-3-small}") String defaultModel,
            @Value("${embedding.dimension:1536}") int defaultDimension) {
        this.profiles = profiles; this.bases = bases; this.defaultProvider = defaultProvider;
        this.defaultModel = defaultModel; this.defaultDimension = defaultDimension;
    }
    public List<EmbeddingProfile> listEnabled() { return profiles.findAll().stream().filter(EmbeddingProfile::isEnabled).toList(); }
    public List<EmbeddingProfile> listAll() { return profiles.findAll(); }
    public EmbeddingProfile get(String id) { return profiles.findById(id).orElseThrow(() -> new IllegalArgumentException("Embedding 配置不存在")); }
    public EmbeddingProfile resolve(KnowledgeBase base) {
        if (base != null && base.getEmbeddingProfileId() != null && !base.getEmbeddingProfileId().isBlank()) {
            EmbeddingProfile profile = get(base.getEmbeddingProfileId());
            if (!profile.isEnabled()) throw new IllegalStateException("Embedding 配置已停用：" + profile.getName());
            return profile;
        }
        // System properties are the authoritative default so environment changes take effect
        // without rewriting every knowledge base or the seeded registry row.
        return builtInDefault();
    }
    public EmbeddingProfile builtInDefault() {
        EmbeddingProfile profile = new EmbeddingProfile(); profile.setId("system-default-embedding"); profile.setName("运行时默认");
        profile.setProvider(defaultProvider); profile.setModel(defaultModel); profile.setDimension(defaultDimension);
        profile.setConfigVersion("runtime"); profile.setDefaultProfile(true); return profile;
    }
    public EmbeddingProfile resolveByKnowledgeBaseId(String id) { return resolve(bases.findById(id).orElseThrow(() -> new IllegalArgumentException("知识库不存在"))); }
    public EmbeddingProfile save(EmbeddingProfile profile) {
        if (profile.getName() == null || profile.getName().isBlank()) throw new IllegalArgumentException("Embedding 配置名称不能为空");
        if (profile.getProvider() == null || profile.getProvider().isBlank()) throw new IllegalArgumentException("Provider 不能为空");
        if (profile.getModel() == null || profile.getModel().isBlank()) throw new IllegalArgumentException("模型不能为空");
        if (profile.getDimension() == null || profile.getDimension() <= 0) throw new IllegalArgumentException("向量维度必须大于 0");
        if (profile.getConfigVersion() == null || profile.getConfigVersion().isBlank()) profile.setConfigVersion("1");
        if (profile.isDefaultProfile()) profiles.findAll().forEach(item -> { if (!item.getId().equals(profile.getId()) && item.isDefaultProfile()) { item.setDefaultProfile(false); profiles.updateById(item); } });
        return profiles.save(profile);
    }
    public EmbeddingProfile configForBase(String baseId) { return resolveByKnowledgeBaseId(baseId); }
    public EmbeddingProfile setForBase(String baseId, String profileId) {
        KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        if (profileId != null && !profileId.isBlank()) {
            EmbeddingProfile profile = get(profileId);
            if (!profile.isEnabled()) throw new IllegalArgumentException("不能选择已停用的 Embedding 配置");
        }
        base.setEmbeddingProfileId(profileId == null || profileId.isBlank() ? null : profileId); base.touch(); bases.save(base);
        return resolve(base);
    }
}
