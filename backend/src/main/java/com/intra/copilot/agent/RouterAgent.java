package com.intra.copilot.agent;

import org.springframework.stereotype.Component;

@Component
public class RouterAgent {
  private final GeneralAgent general;
  private final DiagnosisAgent diagnosis;
  private final TmsManualAgent tms;

  public RouterAgent(GeneralAgent g, DiagnosisAgent d, TmsManualAgent t) {
    general = g;
    diagnosis = d;
    tms = t;
  }

  public Agent route(String text, boolean tmsAuthorized) {
    if (tmsAuthorized && tms.matches(text) && !diagnosis.matches(text)) return tms;
    if (diagnosis.matches(text)) return diagnosis;
    return general;
  }

  public boolean isTmsIntent(String text) {
    return tms.matches(text) && !diagnosis.matches(text);
  }
}
