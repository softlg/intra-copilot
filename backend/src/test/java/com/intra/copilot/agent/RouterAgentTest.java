package com.intra.copilot.agent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class RouterAgentTest {
  private final RouterAgent router =
      new RouterAgent(new GeneralAgent(), new DiagnosisAgent(), new TmsManualAgent());

  @Test
  void routesTmsQuestion() {
    assertEquals("assistant", router.route("TMS 运单怎么操作？", false).id());
    assertEquals("tms-manual", router.route("TMS 运单怎么操作？", true).id());
  }

  @Test
  void routesDiagnosisQuestion() {
    assertEquals("diagnosis", router.route("页面报错，帮我排查", false).id());
  }

  @Test
  void asksClarificationWhenUnknown() {
    assertEquals("assistant", router.route("你好", false).id());
  }
}
