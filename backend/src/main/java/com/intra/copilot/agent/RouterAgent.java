package com.intra.copilot.agent;

import org.springframework.stereotype.Component;

@Component
public class RouterAgent {
  private final GeneralAgent general;

  public RouterAgent(GeneralAgent g) {
    general = g;
  }

  /** Deterministic fallback when the route model is unavailable. */
  public Agent route(String text) {
    return general;
  }
}
