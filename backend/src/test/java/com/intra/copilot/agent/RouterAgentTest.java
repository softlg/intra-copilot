package com.intra.copilot.agent;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RouterAgentTest {
  private final RouterAgent router = new RouterAgent(new DiagnosisAgent(), new TmsManualAgent());
  @Test void routesTmsQuestion(){assertEquals("tms-manual",router.route("TMS 运单怎么操作？").id());}
  @Test void routesDiagnosisQuestion(){assertEquals("diagnosis",router.route("页面报错，帮我排查").id());}
  @Test void asksClarificationWhenUnknown(){assertNull(router.route("你好"));}
}
