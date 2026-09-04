package com.intra.copilot.service;

import com.intra.copilot.agent.DiagnosisAgent;
import com.intra.copilot.agent.GeneralAgent;
import com.intra.copilot.agent.TmsManualAgent;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class DefaultAgentSeeder {
  private final AgentDefinitionRepository definitions;
  private final GeneralAgent general;
  private final DiagnosisAgent diagnosis;
  private final TmsManualAgent tms;

  public DefaultAgentSeeder(
      AgentDefinitionRepository definitions, GeneralAgent general, DiagnosisAgent diagnosis, TmsManualAgent tms) {
    this.definitions = definitions;
    this.general = general;
    this.diagnosis = diagnosis;
    this.tms = tms;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void seed() {
    seed(general.id(), general.displayName(), general.description(), general.systemPrompt(), general.supportsBrowserActions(), 100);
    seed(diagnosis.id(), diagnosis.displayName(), diagnosis.description(), diagnosis.systemPrompt(), diagnosis.supportsBrowserActions(), 20);
    seed(tms.id(), tms.displayName(), tms.description(), tms.systemPrompt(), tms.supportsBrowserActions(), 30);
  }

  private void seed(String id, String name, String description, String prompt, boolean browserActions, int priority) {
    if (definitions.existsById(id)) return;
    AgentDefinition definition =
        new AgentDefinition(id, name, description, prompt, browserActions, priority);
    definition.setSystemAgent(true);
    definitions.save(definition);
  }
}
