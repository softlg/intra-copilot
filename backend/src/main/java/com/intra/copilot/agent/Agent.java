package com.intra.copilot.agent;

import java.util.List;

public interface Agent {
  String id(); String displayName(); String description(); boolean supportsBrowserActions();
  String systemPrompt();
  default boolean matches(String text){ return false; }
}
