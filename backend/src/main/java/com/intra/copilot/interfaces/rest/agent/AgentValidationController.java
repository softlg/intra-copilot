package com.intra.copilot.interfaces.rest.agent;

import com.intra.copilot.application.agent.AgentValidationService;
import com.intra.copilot.domain.agent.AgentValidationRun;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/admin/agents/{agentId}/validations")
public class AgentValidationController {
    private final AgentValidationService validations;

    public AgentValidationController(AgentValidationService validations) {
        this.validations = validations;
    }

    @PostMapping
    public Map<String, Object> validate(
            @PathVariable String agentId,
            @RequestBody(required = false) AgentValidationService.ValidateRequest request) {
        return validations.validate(agentId, request);
    }

    @PostMapping("/static")
    public Map<String, Object> validateStatic(@PathVariable String agentId) {
        return validations.validateStatic(agentId);
    }

    @PostMapping("/cases")
    public Map<String, Object> generateCases(@PathVariable String agentId) {
        return validations.generateValidationCases(agentId);
    }

    @PostMapping("/behavior")
    public Map<String, Object> validateBehavior(
            @PathVariable String agentId,
            @RequestBody AgentValidationService.BehaviorRequest request) {
        return validations.validateBehavior(agentId, request);
    }

    /** Generates one complete, review-only remediation candidate for all failed scenarios. */
    @PostMapping("/remediation")
    public Map<String, Object> generateRemediation(
            @PathVariable String agentId,
            @RequestBody AgentValidationService.RemediationRequest request) {
        return validations.generateRemediation(agentId, request);
    }

    /** Streams one event per scenario so the console can show execution progress. */
    @PostMapping("/behavior/stream")
    public SseEmitter streamValidateBehavior(
            @PathVariable String agentId,
            @RequestBody AgentValidationService.BehaviorRequest request) {
        return validations.streamValidateBehavior(agentId, request);
    }

    @PostMapping("/behavior/{runId}/cancel")
    public Map<String, Object> cancelStreamValidation(@PathVariable String runId) {
        return validations.cancelStreamValidation(runId);
    }

    @GetMapping
    public List<AgentValidationRun> history(
            @PathVariable String agentId, @RequestParam(defaultValue = "10") int limit) {
        return validations.history(agentId, limit);
    }
}
