package com.intra.copilot.service;

import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.model.AgentChildBinding;
import com.intra.copilot.model.AgentConfigVersion;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentChildBindingRepository;
import com.intra.copilot.repo.AgentConfigVersionRepository;
import com.intra.copilot.repo.AgentDefinitionRepository;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentRegistry {
    private final AgentDefinitionRepository definitions;
    private final AgentChildBindingRepository childBindings;
    private final AgentConfigVersionRepository versions;
    private final AgentReleaseSnapshotCodec snapshotCodec;
    // 路由每次请求都会读全量定义（含兜底规则、可用 Agent 列表），加一个短 TTL 缓存避免每轮 LLM 都打 DB。
    private static final long TTL_MS = 5000;
    private final AtomicReference<Cache> allCache = new AtomicReference<>(new Cache(null, 0L));
    private final AtomicReference<Cache> publishedCache =
            new AtomicReference<>(new Cache(null, 0L));

    public AgentRegistry(
            AgentDefinitionRepository definitions,
            AgentChildBindingRepository childBindings,
            AgentConfigVersionRepository versions,
            AgentReleaseSnapshotCodec snapshotCodec) {
        this.definitions = definitions;
        this.childBindings = childBindings;
        this.versions = versions;
        this.snapshotCodec = snapshotCodec;
    }

    public List<AgentDefinition> enabledDefinitions() {
        return publishedDefinitions()
                .stream()
                .sorted(
                        java.util.Comparator.comparingInt(AgentDefinition::getPriority)
                                .thenComparing(AgentDefinition::getDisplayName))
                .toList();
    }

    public List<AgentDefinition> allDefinitions() {
        long now = System.currentTimeMillis();
        Cache entry = allCache.get();
        if (entry.value != null && now - entry.at < TTL_MS) {
            return entry.value.stream().map(AgentDefinition::copy).toList();
        }
        List<AgentDefinition> value = definitions.findAll();
        Map<String, String> parentByChild =
                childBindings
                        .findAll()
                        .stream()
                        .collect(
                                Collectors.toMap(
                                        binding -> binding.getChildAgentId(),
                                        binding -> binding.getParentAgentId(),
                                        (first, ignored) -> first));
        value.forEach(
                definition ->
                        definition.setParentAgentId(
                                "SUB".equals(definition.getRole())
                                        ? parentByChild.get(definition.getId())
                                        : null));
        List<AgentDefinition> cached = value.stream().map(AgentDefinition::copy).toList();
        allCache.set(new Cache(cached, now));
        return cached.stream().map(AgentDefinition::copy).toList();
    }

    public Optional<Agent> findEnabled(String id) {
        return findPublished(id).map(ConfigurableAgent::new);
    }

    public Optional<AgentDefinition> findPublished(String id) {
        return definitions.findById(id).flatMap(this::publishedDefinition);
    }

    private List<AgentDefinition> publishedDefinitions() {
        long now = System.currentTimeMillis();
        Cache entry = publishedCache.get();
        if (entry.value != null && now - entry.at < TTL_MS) {
            return entry.value.stream().map(AgentDefinition::copy).toList();
        }
        List<AgentDefinition> values =
                allDefinitions()
                        .stream()
                        .filter(AgentDefinition::isEnabled)
                        .map(this::publishedDefinition)
                        .flatMap(Optional::stream)
                        .toList();
        List<AgentDefinition> cached = values.stream().map(AgentDefinition::copy).toList();
        publishedCache.set(new Cache(cached, now));
        return cached.stream().map(AgentDefinition::copy).toList();
    }

    /**
     * Resolves the child bindings that were part of the parent's currently published release.
     * Legacy bare AgentDefinition snapshots have no binding payload, so they fall back to the
     * current relational bindings once.
     */
    public List<AgentChildBinding> findPublishedChildBindings(String parentId) {
        AgentDefinition current =
                definitions.findById(parentId).filter(AgentDefinition::isEnabled).orElse(null);
        if (current == null || current.getPublishedVersion() <= 0) return List.of();
        AgentConfigVersion release =
                versions.findByAgentIdAndVersion(parentId, current.getPublishedVersion())
                        .orElse(null);
        if (release == null) return List.of();
        AgentReleaseSnapshotCodec.Decoded decoded = snapshotCodec.decode(release.getSnapshot());
        if (decoded.definition() == null) return List.of();
        if (decoded.structured() && decoded.schemaVersion() >= 1) {
            return decoded.childBindings()
                    .stream()
                    .filter(Objects::nonNull)
                    .filter(binding -> parentId.equals(binding.getParentAgentId()))
                    .filter(binding -> binding.getChildAgentId() != null)
                    .toList();
        }
        return childBindings.findByParent(parentId);
    }

    /** 配置变更后清缓存，避免最长 5s 读到旧值。 */
    public void evict() {
        allCache.set(new Cache(null, 0L));
        publishedCache.set(new Cache(null, 0L));
    }

    @Transactional
    public AgentDefinition save(AgentDefinition definition) {
        AgentDefinition existing = definitions.findById(definition.getId()).orElse(null);
        if (existing != null) {
            SystemAgentGuard.requireUserManaged(existing);
            // The system/custom classification is immutable after creation.
            definition.setSystemAgent(existing.isSystemAgent());
            definition.setOwnerType(existing.getOwnerType());
            definition.setManagementMode(existing.getManagementMode());
            definition.setSystemRevision(existing.getSystemRevision());
            definition.touch();
        } else {
            definition.setSystemAgent(false);
            definition.setOwnerType(SystemAgentGuard.USER_OWNER);
            definition.setManagementMode(SystemAgentGuard.USER_MANAGED);
            definition.setSystemRevision(0L);
        }
        AgentDefinition saved = definitions.save(definition);
        evict();
        return saved;
    }

    @Transactional
    public void delete(String id) {
        AgentDefinition definition =
                definitions
                        .findById(id)
                        .orElseThrow(() -> new java.util.NoSuchElementException("Agent 不存在"));
        SystemAgentGuard.requireUserManaged(definition);
        if (definition.isEnabled()) {
            throw new IllegalArgumentException("只能删除已停用的 Agent");
        }
        if (definition.isSystemAgent()) {
            throw new IllegalArgumentException("系统 Agent 不允许删除");
        }
        definitions.delete(definition);
        evict();
    }

    private Optional<AgentDefinition> publishedDefinition(AgentDefinition current) {
        if (current == null || !current.isEnabled() || current.getPublishedVersion() <= 0) {
            return Optional.empty();
        }
        AgentConfigVersion release =
                versions.findByAgentIdAndVersion(current.getId(), current.getPublishedVersion())
                        .orElse(null);
        if (release == null) return Optional.empty();
        AgentReleaseSnapshotCodec.Decoded decoded = snapshotCodec.decode(release.getSnapshot());
        AgentDefinition snapshot = decoded.definition();
        if (snapshot == null) return Optional.empty();
        snapshot.setId(current.getId());
        // Enable/disable is an operational switch and applies immediately. All other fields come
        // from the immutable release snapshot and are unaffected by draft edits.
        snapshot.setEnabled(current.isEnabled());
        snapshot.setPublished(true);
        snapshot.setPublishedVersion(release.getVersion());
        return Optional.of(snapshot);
    }

    private static final class Cache {
        final List<AgentDefinition> value;
        final long at;

        Cache(List<AgentDefinition> value, long at) {
            this.value = value;
            this.at = at;
        }
    }
}
