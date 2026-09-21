package com.intra.copilot.application.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.AgentChildBinding;
import com.intra.copilot.domain.agent.AgentConfigVersion;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.infrastructure.persistence.agent.AgentChildBindingRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentConfigVersionRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.agent.AgentSkillBindingRepository;
import com.intra.copilot.shared.identity.RequestContext;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentConfigurationService {
    private static final Logger log = LoggerFactory.getLogger(AgentConfigurationService.class);
    private final AgentDefinitionRepository definitions;
    private final AgentConfigVersionRepository versions;
    private final AgentChildBindingRepository bindings;
    private final AgentSkillBindingRepository skillBindings;
    private final AgentRegistry registry;
    private final ObjectMapper mapper;
    private final AgentReleaseSnapshotCodec snapshotCodec;

    public AgentConfigurationService(
            AgentDefinitionRepository definitions,
            AgentConfigVersionRepository versions,
            AgentChildBindingRepository bindings,
            AgentSkillBindingRepository skillBindings,
            AgentRegistry registry,
            ObjectMapper mapper,
            AgentReleaseSnapshotCodec snapshotCodec) {
        this.definitions = definitions;
        this.versions = versions;
        this.bindings = bindings;
        this.skillBindings = skillBindings;
        this.registry = registry;
        this.mapper = mapper;
        this.snapshotCodec = snapshotCodec;
    }

    @Transactional
    public AgentDefinition saveDraft(AgentDefinition definition) {
        validate(definition);
        AgentDefinition existing = definitions.findById(definition.getId()).orElse(null);
        String actor = RequestContext.currentOrAnonymous().actorLabel();
        if (existing != null) {
            SystemAgentGuard.requireUserManaged(existing);
            definition.setSystemAgent(existing.isSystemAgent());
            definition.setOwnerType(existing.getOwnerType());
            definition.setManagementMode(existing.getManagementMode());
            definition.setSystemRevision(existing.getSystemRevision());
            definition.setCreatedBy(
                    existing.getCreatedBy() == null || existing.getCreatedBy().isBlank()
                            ? actor
                            : existing.getCreatedBy());
            // Editing an already published definition creates a draft.  The
            // running registry must continue to use the last published
            // snapshot until the administrator explicitly publishes it.
            definition.setPublished(false);
            definition.setPublishedVersion(existing.getPublishedVersion());
            definition.setVersion(existing.getVersion() + 1);
        } else {
            definition.setSystemAgent(false);
            definition.setOwnerType(SystemAgentGuard.USER_OWNER);
            definition.setManagementMode(SystemAgentGuard.USER_MANAGED);
            definition.setSystemRevision(0L);
            definition.setCreatedBy(actor);
            definition.setPublished(false);
            definition.setPublishedVersion(0);
            definition.setVersion(1);
        }
        if (!SystemAgentGuard.SYSTEM_LOCKED.equalsIgnoreCase(definition.getManagementMode())) {
            definition.setSupportsBrowserActions(false);
        }
        definition.setUpdatedBy(actor);
        AgentDefinition saved = definitions.save(definition);
        synchronizeChildBinding(saved);
        attachParent(saved);
        registry.evict();
        log.info(
                "Agent draft saved agentId={} version={} role={} enabled={} published={} actor={}",
                saved.getId(),
                saved.getVersion(),
                saved.getRole(),
                saved.isEnabled(),
                saved.isPublished(),
                actor);
        return saved;
    }

    @Transactional
    public AgentConfigVersion publish(String id, String releaseNote) {
        return publish(id, releaseNote, "anonymous");
    }

    @Transactional
    public AgentConfigVersion publish(String id, String releaseNote, String publishedBy) {
        AgentDefinition definition = get(id);
        SystemAgentGuard.requireUserManaged(definition);
        validate(definition);
        List<AgentChildBinding> releaseBindings = bindings.findByParent(id);
        long next = nextVersion(id);
        archiveVersions(id);
        definition.setPublished(true);
        definition.setPublishedVersion(next);
        definitions.save(definition);
        skillBindings.replace(definition.getId(), parseIds(definition.getSkillIds()));
        AgentConfigVersion version = new AgentConfigVersion();
        version.setAgentId(id);
        version.setVersion(next);
        version.setStatus("PUBLISHED");
        version.setReleaseNote(releaseNote);
        version.setPublishedBy(trimToNull(publishedBy));
        version.setSnapshot(snapshotCodec.encode(definition, releaseBindings));
        AgentConfigVersion saved = versions.save(version);
        registry.evict();
        log.info(
                "Agent published agentId={} publishedVersion={} actor={} releaseNoteChars={}",
                id,
                next,
                publishedBy,
                releaseNote == null ? 0 : releaseNote.length());
        return saved;
    }

    @Transactional
    public AgentDefinition rollback(String id, long version) {
        return rollback(id, version, "anonymous");
    }

    @Transactional
    public AgentDefinition rollback(String id, long version, String publishedBy) {
        AgentDefinition current = get(id);
        SystemAgentGuard.requireUserManaged(current);
        AgentConfigVersion target =
                versions.findByAgentId(id)
                        .stream()
                        .filter(item -> item.getVersion() == version)
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("Agent 版本不存在"));
        AgentReleaseSnapshotCodec.Decoded decoded = snapshotCodec.decode(target.getSnapshot());
        if (decoded.definition() == null) {
            throw new IllegalArgumentException("Agent 版本快照无法恢复");
        }
        AgentDefinition restored = decoded.definition();
        restored.setId(id);
        // Enable/disable is immediate operational state and survives rollback.
        restored.setEnabled(current.isEnabled());
        restored.setPublished(true);
        restored.setPublishedVersion(nextVersion(id));
        restored.setVersion(current.getVersion() + 1);

        List<AgentChildBinding> restoredBindings =
                decoded.structured() && decoded.schemaVersion() >= 1
                        ? normalizeBindings(id, decoded.childBindings())
                        : bindings.findByParent(id);
        long next = restored.getPublishedVersion();
        archiveVersions(id);
        definitions.save(restored);
        skillBindings.replace(restored.getId(), parseIds(restored.getSkillIds()));
        if (decoded.structured() && decoded.schemaVersion() >= 1) {
            restoreChildBindings(id, restoredBindings);
        }

        AgentConfigVersion release = new AgentConfigVersion();
        release.setAgentId(id);
        release.setVersion(next);
        release.setStatus("PUBLISHED");
        release.setReleaseNote("回滚到版本 " + version);
        release.setPublishedBy(trimToNull(publishedBy));
        release.setSnapshot(snapshotCodec.encode(restored, restoredBindings));
        versions.save(release);
        attachParent(restored);
        registry.evict();
        log.info(
                "Agent rolled back agentId={} targetVersion={} newPublishedVersion={} actor={}",
                id,
                version,
                restored.getPublishedVersion(),
                publishedBy);
        return restored;
    }

    public List<AgentConfigVersion> versions(String id) {
        get(id);
        return versions.findByAgentId(id);
    }

    @Transactional
    public List<AgentChildBinding> replaceChildren(
            String parentId, List<AgentChildBinding> requested) {
        AgentDefinition parent = get(parentId);
        SystemAgentGuard.requireUserManaged(parent);
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
            SystemAgentGuard.requireUserManaged(child);
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
        List<AgentChildBinding> saved = bindings.findByParent(parentId);
        log.info(
                "Agent child bindings replaced parentAgent={} bindingCount={}",
                parentId,
                saved.size());
        return saved;
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
        String planningMode =
                definition.getPlanningMode() == null
                        ? "AUTO"
                        : definition.getPlanningMode().toUpperCase();
        if (!List.of("OFF", "AUTO", "ALWAYS").contains(planningMode)) {
            definition.setPlanningMode("AUTO");
        } else {
            definition.setPlanningMode(planningMode);
        }
        definition.setMaxPlanSteps(Math.max(1, Math.min(12, definition.getMaxPlanSteps())));
        if (!SystemAgentGuard.SYSTEM_LOCKED.equalsIgnoreCase(definition.getManagementMode())) {
            definition.setSupportsBrowserActions(false);
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

    private long nextVersion(String id) {
        return versions.findByAgentId(id)
                        .stream()
                        .mapToLong(AgentConfigVersion::getVersion)
                        .max()
                        .orElse(0)
                + 1;
    }

    private void archiveVersions(String id) {
        versions.findByAgentId(id)
                .forEach(
                        item -> {
                            item.setStatus("ARCHIVED");
                            versions.save(item);
                        });
    }

    private List<AgentChildBinding> normalizeBindings(
            String parentId, List<AgentChildBinding> values) {
        if (values == null || values.isEmpty()) return List.of();
        return values.stream()
                .filter(value -> value != null)
                .filter(
                        value ->
                                value.getChildAgentId() != null
                                        && !value.getChildAgentId().isBlank())
                .filter(value -> !parentId.equals(value.getChildAgentId()))
                .collect(
                        java.util.stream.Collectors.toMap(
                                value -> value.getChildAgentId().trim(),
                                value -> copyBinding(parentId, value),
                                (first, ignored) -> first,
                                java.util.LinkedHashMap::new))
                .values()
                .stream()
                .toList();
    }

    private AgentChildBinding copyBinding(String parentId, AgentChildBinding source) {
        AgentChildBinding binding = new AgentChildBinding();
        binding.setParentAgentId(parentId);
        binding.setChildAgentId(source.getChildAgentId().trim());
        binding.setPriority(Math.max(0, source.getPriority()));
        binding.setRoutingRule(source.getRoutingRule());
        binding.setEnabled(source.isEnabled());
        return binding;
    }

    private void restoreChildBindings(String parentId, List<AgentChildBinding> values) {
        bindings.deleteByParent(parentId);
        for (AgentChildBinding value : values) {
            bindings.deleteByChild(value.getChildAgentId());
            AgentChildBinding binding = copyBinding(parentId, value);
            binding.setId(EntityIdGenerator.next("AB"));
            bindings.insert(binding);
        }
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
