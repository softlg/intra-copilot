package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Instant;

@TableName("embedding_profile")
public class EmbeddingProfile {
    @TableId private String id = EntityIdGenerator.next("EP");
    private String name;
    private String provider;
    private String model;
    private Integer dimension;
    private String configVersion = "1";
    private Integer maxInputTokens;
    private String description;
    private boolean enabled = true;
    private boolean defaultProfile;
    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public String getId() { return id; }
    public void setId(String value) { id = value; }
    public String getName() { return name; }
    public void setName(String value) { name = value; }
    public String getProvider() { return provider; }
    public void setProvider(String value) { provider = value; }
    public String getModel() { return model; }
    public void setModel(String value) { model = value; }
    public Integer getDimension() { return dimension; }
    public void setDimension(Integer value) { dimension = value; }
    public String getConfigVersion() { return configVersion; }
    public void setConfigVersion(String value) { configVersion = value; }
    public Integer getMaxInputTokens() { return maxInputTokens; }
    public void setMaxInputTokens(Integer value) { maxInputTokens = value; }
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { enabled = value; }
    public boolean isDefaultProfile() { return defaultProfile; }
    public void setDefaultProfile(boolean value) { defaultProfile = value; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void touch() { updatedAt = Instant.now(); }
}
