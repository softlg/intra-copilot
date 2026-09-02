package com.intra.copilot.agent;

import com.intra.copilot.model.AgentDefinition;

public final class ConfigurableAgent implements Agent {
  private final AgentDefinition definition;

  public ConfigurableAgent(AgentDefinition definition) {
    this.definition = definition;
  }

  public String id() {
    return definition.getId();
  }

  public String displayName() {
    return definition.getDisplayName();
  }

  public String description() {
    return definition.getDescription();
  }

  public boolean supportsBrowserActions() {
    return definition.isSupportsBrowserActions();
  }

  public String systemPrompt() {
    return definition.getSystemPrompt();
  }

  public AgentDefinition definition() {
    return definition;
  }
}
