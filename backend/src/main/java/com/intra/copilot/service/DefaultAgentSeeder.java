package com.intra.copilot.service;

import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.RouteCopilotAgent;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class DefaultAgentSeeder {
  private final AgentDefinitionRepository definitions;
  private final GeneralAgent general;
  private final RouteCopilotAgent routeCopilot;

  public DefaultAgentSeeder(
      AgentDefinitionRepository definitions, GeneralAgent general, RouteCopilotAgent routeCopilot) {
    this.definitions = definitions;
    this.general = general;
    this.routeCopilot = routeCopilot;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void seed() {
    removeLegacyAgents();
    seed(general.id(), general.displayName(), general.description(), general.systemPrompt(), general.supportsBrowserActions(), 100);
    seed(routeCopilot.id(), routeCopilot.displayName(), routeCopilot.description(), routeCopilot.systemPrompt(), routeCopilot.supportsBrowserActions(), 10);
  }

  private void removeLegacyAgents() {
    definitions.deleteById("diagnosis");
    definitions.deleteById("tms-manual");
  }

  private void seed(String id, String name, String description, String prompt, boolean browserActions, int priority) {
    if (definitions.existsById(id)) return;
    AgentDefinition definition =
        new AgentDefinition(id, name, description, prompt, browserActions, priority);
    definition.setSystemAgent(true);
    definitions.save(definition);
  }
}
