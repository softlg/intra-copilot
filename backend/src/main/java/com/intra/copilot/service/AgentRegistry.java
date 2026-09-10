package com.intra.copilot.service;

import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentRegistry {
    private final AgentDefinitionRepository definitions;
    // 路由每次请求都会读全量定义（含兜底规则、可用 Agent 列表），加一个短 TTL 缓存避免每轮 LLM 都打 DB。
    private static final long TTL_MS = 5000;
    private final AtomicReference<Cache> allCache = new AtomicReference<>(new Cache(null, 0L));

    public AgentRegistry(AgentDefinitionRepository definitions) {
        this.definitions = definitions;
    }

    public List<AgentDefinition> enabledDefinitions() {
        return allDefinitions().stream()
                .filter(AgentDefinition::isEnabled)
                .sorted(java.util.Comparator.comparingInt(AgentDefinition::getPriority)
                        .thenComparing(AgentDefinition::getDisplayName))
                .toList();
    }

    public List<AgentDefinition> allDefinitions() {
        long now = System.currentTimeMillis();
        Cache entry = allCache.get();
        if (entry.value != null && now - entry.at < TTL_MS) {
            return entry.value;
        }
        List<AgentDefinition> value = definitions.findAll();
        allCache.set(new Cache(value, now));
        return value;
    }

    public Optional<Agent> findEnabled(String id) {
        return definitions.findById(id)
                .filter(definition -> definition.isEnabled() && definition.isPublished())
                .map(ConfigurableAgent::new);
    }

    public Optional<AgentDefinition> findPublished(String id) {
        return definitions.findById(id)
                .filter(definition -> definition.isEnabled() && definition.isPublished());
    }

    /** 配置变更后清缓存，避免最长 5s 读到旧值。 */
    public void evict() {
        allCache.set(new Cache(null, 0L));
    }

    @Transactional
    public AgentDefinition save(AgentDefinition definition) {
        AgentDefinition existing = definitions.findById(definition.getId()).orElse(null);
        if (existing != null) {
            // The system/custom classification is immutable after creation.
            definition.setSystemAgent(existing.isSystemAgent());
            definition.touch();
        } else {
            definition.setSystemAgent(false);
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
        if (definition.isEnabled()) {
            throw new IllegalArgumentException("只能删除已停用的 Agent");
        }
        if (definition.isSystemAgent()) {
            throw new IllegalArgumentException("系统 Agent 不允许删除");
        }
        definitions.delete(definition);
        evict();
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
