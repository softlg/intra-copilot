package com.intra.copilot.agent;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class RouterAgentTest {
  private final RouterAgent router = new RouterAgent(new GeneralAgent());

  @Test
  void fallsBackToIntraCopilotWhenRouteModelUnavailable() {
    assertEquals("assistant", router.route("页面报错，帮我排查").id());
  }

  @Test
  void asksClarificationWhenUnknown() {
    assertEquals("assistant", router.route("你好").id());
  }
}
