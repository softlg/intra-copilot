package com.intra.copilot.service;

import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentRegistry {
  private final AgentDefinitionRepository definitions;

  public AgentRegistry(AgentDefinitionRepository definitions) {
    this.definitions = definitions;
  }

  public List<AgentDefinition> enabledDefinitions() {
    return definitions.findAllByEnabledTrueOrderByPriorityAscDisplayNameAsc();
  }

  public List<AgentDefinition> allDefinitions() {
    return definitions.findAll();
  }

  public Optional<Agent> findEnabled(String id) {
    return definitions.findById(id).filter(AgentDefinition::isEnabled).map(ConfigurableAgent::new);
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
    return definitions.save(definition);
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
      throw new IllegalArgumentException("主 Agent 不允许删除");
    }
    definitions.delete(definition);
  }
}
