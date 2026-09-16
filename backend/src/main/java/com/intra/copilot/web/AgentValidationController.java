package com.intra.copilot.web;

import com.intra.copilot.model.AgentValidationRun;
import com.intra.copilot.service.AgentValidationService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

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

    @GetMapping
    public List<AgentValidationRun> history(
            @PathVariable String agentId, @RequestParam(defaultValue = "10") int limit) {
        return validations.history(agentId, limit);
    }
}
