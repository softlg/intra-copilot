package com.intra.copilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.model.AgentConfigVersion;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentChildBindingRepository;
import com.intra.copilot.repo.AgentConfigVersionRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.AgentSkillBindingRepository;
import com.intra.copilot.util.EntityIdGenerator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentConfigurationService {
    private final AgentDefinitionRepository definitions;
    private final AgentConfigVersionRepository versions;
    private final AgentChildBindingRepository bindings;
    private final AgentSkillBindingRepository skillBindings;
    private final AgentRegistry registry;
    private final ObjectMapper mapper;

    public AgentConfigurationService(
            AgentDefinitionRepository definitions,
            AgentConfigVersionRepository versions,
            AgentChildBindingRepository bindings,
            AgentSkillBindingRepository skillBindings,
            AgentRegistry registry,
            ObjectMapper mapper) {
        this.definitions = definitions;
        this.versions = versions;
        this.bindings = bindings;
        this.skillBindings = skillBindings;
        this.registry = registry;
        this.mapper = mapper;
    }

    @Transactional
    public AgentDefinition saveDraft(AgentDefinition definition) {
        validate(definition);
        AgentDefinition existing = definitions.findById(definition.getId()).orElse(null);
        if (existing != null) {
            definition.setSystemAgent(existing.isSystemAgent());
            // Editing an already published definition creates a draft.  The
            // running registry must continue to use the last published
            // snapshot until the administrator explicitly publishes it.
            definition.setPublished(false);
            definition.setPublishedVersion(existing.getPublishedVersion());
            definition.setVersion(existing.getVersion() + 1);
        } else {
            definition.setPublished(false);
            definition.setPublishedVersion(0);
            definition.setVersion(1);
        }
        AgentDefinition saved = definitions.save(definition);
        skillBindings.replace(saved.getId(), parseIds(saved.getSkillIds()));
        synchronizeChildBinding(saved);
        attachParent(saved);
        registry.evict();
        return saved;
    }

    @Transactional
    public AgentConfigVersion publish(String id, String releaseNote) {
        AgentDefinition definition = get(id);
        validate(definition);
        long next =
                versions.findByAgentId(id)
                                .stream()
                                .mapToLong(AgentConfigVersion::getVersion)
                                .max()
                                .orElse(0)
                        + 1;
        versions.findByAgentId(id)
                .forEach(
                        item -> {
                            item.setStatus("ARCHIVED");
                            versions.save(item);
                        });
        definition.setPublished(true);
        definition.setPublishedVersion(next);
        definitions.save(definition);
        AgentConfigVersion version = new AgentConfigVersion();
        version.setAgentId(id);
        version.setVersion(next);
        version.setStatus("PUBLISHED");
        version.setReleaseNote(releaseNote);
        try {
            version.setSnapshot(mapper.writeValueAsString(definition));
        } catch (Exception error) {
            throw new IllegalArgumentException("Agent 配置无法生成版本快照");
        }
        AgentConfigVersion saved = versions.save(version);
        registry.evict();
        return saved;
    }

    @Transactional
    public AgentDefinition rollback(String id, long version) {
        AgentConfigVersion target =
                versions.findByAgentId(id)
                        .stream()
                        .filter(item -> item.getVersion() == version)
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("Agent 版本不存在"));
        try {
            AgentDefinition restored =
                    mapper.readValue(target.getSnapshot(), AgentDefinition.class);
            restored.setId(id);
            AgentDefinition current = get(id);
            restored.setPublished(true);
            restored.setPublishedVersion(version);
            restored.setVersion(current.getVersion() + 1);
            // A rollback is itself a new published release.  Keeping a new
            // version entry makes the operation auditable and allows a later
            // rollback without mutating historical snapshots.
            long next =
                    versions.findByAgentId(id)
                                    .stream()
                                    .mapToLong(AgentConfigVersion::getVersion)
                                    .max()
                                    .orElse(version)
                            + 1;
            versions.findByAgentId(id)
                    .forEach(
                            item -> {
                                item.setStatus("ARCHIVED");
                                versions.save(item);
                            });
            AgentConfigVersion release = new AgentConfigVersion();
            release.setAgentId(id);
            release.setVersion(next);
            release.setStatus("PUBLISHED");
            release.setReleaseNote("回滚到版本 " + version);
            release.setSnapshot(mapper.writeValueAsString(restored));
            restored.setPublishedVersion(next);
            definitions.save(restored);
            skillBindings.replace(restored.getId(), parseIds(restored.getSkillIds()));
            versions.save(release);
            attachParent(restored);
            registry.evict();
            return restored;
        } catch (Exception error) {
            throw new IllegalArgumentException("Agent 版本快照无法恢复");
        }
    }

    public List<AgentConfigVersion> versions(String id) {
        get(id);
        return versions.findByAgentId(id);
    }

    @Transactional
    public List<AgentChildBinding> replaceChildren(
            String parentId, List<AgentChildBinding> requested) {
        AgentDefinition parent = get(parentId);
        if (!"DOMAIN".equals(parent.getRole()))
            throw new IllegalArgumentException("只有领域 Agent 可以绑定子 Agent");
        List<AgentChildBinding> values = requested == null ? List.of() : requested;
        Set<String> childIds = new HashSet<>();
        for (AgentChildBinding binding : values) {
            if (binding == null) throw new IllegalArgumentException("子 Agent 绑定不能为空");
            String childId = trimToNull(binding.getChildAgentId());
            if (childId == null) throw new IllegalArgumentException("子 Agent 不能为空");
            if (!childIds.add(childId)) throw new IllegalArgumentException("不能重复绑定同一个子 Agent");
            AgentDefinition child = get(childId);
            if (!"SUB".equals(child.getRole()))
                throw new IllegalArgumentException("只能绑定 SUB 类型 Agent");
            if (parentId.equals(child.getId())) throw new IllegalArgumentException("Agent 不能绑定自己");
            Optional<AgentChildBinding> currentOwner = bindings.findOneByChild(childId);
            if (currentOwner.isPresent()
                    && !parentId.equals(currentOwner.get().getParentAgentId())) {
                throw new IllegalArgumentException("一个子 Agent 只能绑定一个领域 Agent");
            }
            binding.setId(EntityIdGenerator.next("AB"));
            binding.setParentAgentId(parentId);
            binding.setChildAgentId(childId);
            if (binding.getPriority() < 0) binding.setPriority(0);
        }
        bindings.deleteByParent(parentId);
        values.forEach(bindings::insert);
        registry.evict();
        return bindings.findByParent(parentId);
    }

    public List<AgentChildBinding> children(String parentId) {
        get(parentId);
        return bindings.findByParent(parentId);
    }

    public AgentDefinition get(String id) {
        return attachParent(
                definitions
                        .findById(id)
                        .orElseThrow(() -> new java.util.NoSuchElementException("Agent 不存在")));
    }

    private void validate(AgentDefinition definition) {
        if (definition == null
                || definition.getId() == null
                || definition.getDisplayName() == null
                || definition.getDisplayName().isBlank()
                || definition.getSystemPrompt() == null
                || definition.getSystemPrompt().isBlank()) {
            throw new IllegalArgumentException("Agent 基本信息不完整");
        }
        String role = definition.getRole() == null ? "DOMAIN" : definition.getRole().toUpperCase();
        if (!List.of("MAIN", "GENERAL", "DOMAIN", "SUB").contains(role))
            throw new IllegalArgumentException("Agent 类型无效");
        definition.setRole(role);
        if (definition.getPriority() < 0) definition.setPriority(0);
        String parentAgentId = trimToNull(definition.getParentAgentId());
        definition.setParentAgentId(parentAgentId);
        if (!"SUB".equals(role) && parentAgentId != null) {
            throw new IllegalArgumentException("只有子 Agent 可以绑定领域 Agent");
        }
        if ("SUB".equals(role) && parentAgentId != null) {
            AgentDefinition parent =
                    definitions
                            .findById(parentAgentId)
                            .orElseThrow(() -> new IllegalArgumentException("父 Agent 不存在"));
            if (!"DOMAIN".equals(parent.getRole())) {
                throw new IllegalArgumentException("子 Agent 的父级必须是领域 Agent");
            }
        }
        String handlingMode =
                definition.getHandlingMode() == null
                        ? "AUTO"
                        : definition.getHandlingMode().toUpperCase();
        if (!List.of("DIRECT", "DELEGATE", "AUTO").contains(handlingMode)) {
            definition.setHandlingMode("AUTO");
        } else {
            definition.setHandlingMode(handlingMode);
        }
        String returnMode =
                definition.getReturnMode() == null
                        ? "CHILD_DIRECT"
                        : definition.getReturnMode().toUpperCase();
        if (!List.of("CHILD_DIRECT", "DOMAIN_SUMMARY").contains(returnMode)) {
            definition.setReturnMode("CHILD_DIRECT");
        } else {
            definition.setReturnMode(returnMode);
        }
    }

    private void synchronizeChildBinding(AgentDefinition definition) {
        String childId = definition.getId();
        if (!"SUB".equals(definition.getRole())) {
            bindings.deleteByChild(childId);
            definition.setParentAgentId(null);
            return;
        }
        String parentId = trimToNull(definition.getParentAgentId());
        if (parentId == null) {
            bindings.deleteByChild(childId);
            return;
        }
        Optional<AgentChildBinding> existing = bindings.findOneByChild(childId);
        if (existing.isPresent() && parentId.equals(existing.get().getParentAgentId())) return;
        bindings.deleteByChild(childId);
        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId(parentId);
        binding.setChildAgentId(childId);
        binding.setPriority(nextChildPriority(parentId));
        binding.setEnabled(true);
        bindings.insert(binding);
    }

    private AgentDefinition attachParent(AgentDefinition definition) {
        if (definition == null) return null;
        String parentId =
                "SUB".equals(definition.getRole())
                        ? bindings.findOneByChild(definition.getId())
                                .map(AgentChildBinding::getParentAgentId)
                                .orElse(null)
                        : null;
        definition.setParentAgentId(parentId);
        return definition;
    }

    private int nextChildPriority(String parentId) {
        return bindings.findByParent(parentId)
                        .stream()
                        .mapToInt(AgentChildBinding::getPriority)
                        .max()
                        .orElse(90)
                + 10;
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private List<String> parseIds(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<String> values =
                    mapper.readValue(
                            raw,
                            mapper.getTypeFactory()
                                    .constructCollectionType(List.class, String.class));
            return values == null
                    ? List.of()
                    : values.stream()
                            .filter(value -> value != null && !value.isBlank())
                            .map(String::trim)
                            .distinct()
                            .toList();
        } catch (Exception ignored) {
            return List.of();
        }
    }
}
