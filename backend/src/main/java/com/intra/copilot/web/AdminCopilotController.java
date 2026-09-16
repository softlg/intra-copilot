package com.intra.copilot.web;

import com.intra.copilot.model.AdminCopilotSession;
import com.intra.copilot.service.AdminCopilotService;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/copilot")
public class AdminCopilotController {
    private final AdminCopilotService copilot;

    public AdminCopilotController(AdminCopilotService copilot) {
        this.copilot = copilot;
    }

    @GetMapping("/sessions")
    public List<AdminCopilotSession> sessions() {
        return copilot.listSessions();
    }

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createSession(
            @RequestBody(required = false) CreateSessionRequest request) {
        return copilot.createSession(
                request == null ? null : request.mode(),
                request == null ? null : request.title(),
                request == null ? null : request.currentAgentId());
    }

    @GetMapping("/sessions/{id}")
    public Map<String, Object> session(@PathVariable String id) {
        return copilot.getSession(id);
    }

    @PostMapping("/sessions/{id}/respond")
    public Map<String, Object> respond(
            @PathVariable String id, @RequestBody AdminCopilotService.RespondRequest request) {
        return copilot.respond(id, request);
    }

    @PostMapping("/sessions/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable String id) {
        return copilot.cancel(id);
    }

    @PostMapping("/proposals/{id}/apply")
    public Map<String, Object> apply(@PathVariable String id) {
        return copilot.applyProposal(id);
    }

    public record CreateSessionRequest(String mode, String title, String currentAgentId) {}
}
