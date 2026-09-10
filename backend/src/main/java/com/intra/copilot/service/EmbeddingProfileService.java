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
            @Value("${embedding.dimension:1024}") int defaultDimension) {
        this.profiles = profiles; this.bases = bases; this.defaultProvider = defaultProvider;
        this.defaultModel = defaultModel; this.defaultDimension = defaultDimension;
    }
    public List<EmbeddingProfile> listEnabled() { return profiles.findAll().stream().filter(EmbeddingProfile::isEnabled).toList(); }
    public List<EmbeddingProfile> listAll() { return profiles.findAll(); }
    public EmbeddingProfile get(String id) { return profiles.findById(id).orElseThrow(() -> new IllegalArgumentException("Embedding 配置不存在")); }
    public EmbeddingProfile resolve(KnowledgeBase base) {
        // A per-base custom model (toggle off) takes precedence over a selected profile.
        if (base != null && Boolean.FALSE.equals(base.getUseSystemEmbedding()) && hasCustomEmbedding(base)) {
            return customProfile(base);
        }
        if (base != null && base.getEmbeddingProfileId() != null && !base.getEmbeddingProfileId().isBlank()) {
            EmbeddingProfile profile = get(base.getEmbeddingProfileId());
            if (!profile.isEnabled()) throw new IllegalStateException("Embedding 配置已停用：" + profile.getName());
            return profile;
        }
        // System properties are the authoritative default so environment changes take effect
        // without rewriting every knowledge base or the seeded registry row.
        return builtInDefault();
    }
    private boolean hasCustomEmbedding(KnowledgeBase base) {
        return base.getEmbeddingProvider() != null && !base.getEmbeddingProvider().isBlank()
            && base.getEmbeddingModel() != null && !base.getEmbeddingModel().isBlank()
            && base.getEmbeddingDimension() != null && base.getEmbeddingDimension() > 0;
    }
    private EmbeddingProfile customProfile(KnowledgeBase base) {
        EmbeddingProfile profile = new EmbeddingProfile();
        profile.setId("kb-custom-" + base.getId());
        profile.setName((base.getName() == null ? "自定义模型" : base.getName() + " · 自定义模型"));
        profile.setProvider(base.getEmbeddingProvider());
        profile.setModel(base.getEmbeddingModel());
        profile.setDimension(base.getEmbeddingDimension());
        profile.setConfigVersion("custom");
        profile.setDefaultProfile(false);
        profile.setEnabled(true);
        return profile;
    }
    public EmbeddingProfile builtInDefault() {
        EmbeddingProfile profile = new EmbeddingProfile(); profile.setId("system-default-embedding"); profile.setName("运行时默认");
        profile.setProvider(defaultProvider); profile.setModel(defaultModel); profile.setDimension(defaultDimension);
        profile.setConfigVersion("runtime"); profile.setDefaultProfile(true); return profile;
    }
    /** Request body for {@link #applyConfig}: either inherit the system model, supply a custom
     *  one, or (legacy) pick a centrally managed profile by id. */
    public record EmbeddingConfigRequest(
        Boolean useSystemEmbedding,
        String provider,
        String model,
        Integer dimension,
        String profileId
    ) {}
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
        return applyConfig(baseId, new EmbeddingConfigRequest(null, null, null, null, profileId));
    }
    /** Apply the embedding configuration chosen in the admin console. */
    public EmbeddingProfile applyConfig(String baseId, EmbeddingConfigRequest request) {
        KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        if (request.useSystemEmbedding() != null && request.useSystemEmbedding()) {
            // Inherit the system default model: clear any custom or selected profile.
            base.setUseSystemEmbedding(true);
            base.setEmbeddingProvider(null);
            base.setEmbeddingModel(null);
            base.setEmbeddingDimension(null);
            base.setEmbeddingProfileId(null);
        } else if (request.useSystemEmbedding() != null && !request.useSystemEmbedding()) {
            // Custom model supplied by the user; credentials still come from env by provider.
            String provider = request.provider();
            String model = request.model();
            Integer dimension = request.dimension();
            if (provider == null || provider.isBlank() || model == null || model.isBlank()
                    || dimension == null || dimension <= 0) {
                throw new IllegalArgumentException("自定义模型需填写提供方、模型名与大于 0 的向量维度");
            }
            base.setUseSystemEmbedding(false);
            base.setEmbeddingProvider(provider.trim());
            base.setEmbeddingModel(model.trim());
            base.setEmbeddingDimension(dimension);
            base.setEmbeddingProfileId(null);
        } else {
            // Legacy behaviour: only a centrally managed profile is selected.
            if (request.profileId() != null && !request.profileId().isBlank()) {
                EmbeddingProfile profile = get(request.profileId());
                if (!profile.isEnabled()) throw new IllegalArgumentException("不能选择已停用的 Embedding 配置");
            }
            base.setEmbeddingProfileId(request.profileId() == null || request.profileId().isBlank() ? null : request.profileId());
        }
        base.touch();
        bases.save(base);
        return resolve(base);
    }
}
