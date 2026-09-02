package com.intra.copilot.web;

import com.intra.copilot.service.AgentOrchestrator;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/router")
public class RouterAdminController {
  private final AgentOrchestrator orchestrator;
  public RouterAdminController(AgentOrchestrator orchestrator) { this.orchestrator = orchestrator; }
  public record RouterTestRequest(String message, String pageContext, boolean tmsAuthorized) {}
  @PostMapping("/test")
  public Map<String, Object> test(@RequestBody RouterTestRequest request) {
    var result = orchestrator.route(request.message(), request.pageContext(), List.of(), request.tmsAuthorized());
    return Map.of("agentId", result.selectedAgentId(), "confidence", result.confidence(), "reason", result.reason(), "routeSource", result.routeSource(), "needsClarification", result.needsClarification());
  }
}
