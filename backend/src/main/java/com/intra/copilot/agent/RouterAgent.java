package com.intra.copilot.agent;
import org.springframework.stereotype.Component;
@Component public class RouterAgent {
  private final DiagnosisAgent diagnosis; private final TmsManualAgent tms;
  public RouterAgent(DiagnosisAgent d,TmsManualAgent t){diagnosis=d;tms=t;}
  public Agent route(String text){ if(tms.matches(text) && !diagnosis.matches(text)) return tms; if(diagnosis.matches(text)) return diagnosis; return null; }
}
