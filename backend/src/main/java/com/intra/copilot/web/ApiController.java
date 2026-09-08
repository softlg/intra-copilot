package com.intra.copilot.web;

import com.intra.copilot.agent.*;
import com.intra.copilot.model.*;
import com.intra.copilot.service.ChatService;
import com.intra.copilot.service.AgentRegistry;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1")
public class ApiController {
    private final ChatService chat;
    private final GeneralAgent general;
    private final RouteCopilotAgent routeCopilot;
    private final AgentRegistry registry;

    public ApiController(ChatService c, GeneralAgent g, RouteCopilotAgent routeCopilot, AgentRegistry registry) {
        chat = c;
        general = g;
        this.routeCopilot = routeCopilot;
        this.registry = registry;
    }

    @GetMapping("/agents")
    public List<Map<String, Object>> agents() {
        return registry.enabledDefinitions().stream()
                .filter(definition -> List.of("GENERAL", "DOMAIN").contains(definition.getRole()))
                .map(definition -> {
                    Map<String, Object> value = new LinkedHashMap<>();
                    value.put("id", definition.getId());
                    value.put("displayName", definition.getDisplayName());
                    value.put("description", definition.getDescription());
                    value.put("role", definition.getRole());
                    value.put("supportsBrowserActions", definition.isSupportsBrowserActions());
                    value.put("publishedVersion", definition.getPublishedVersion());
                    return value;
                }).toList();
    }

    @PostMapping("/sessions")
    public Conversation create() {
        return chat.create();
    }

    @GetMapping("/sessions")
    public List<Conversation> list() {
        return chat.list();
    }

    @GetMapping("/sessions/{id}/messages")
    public List<Message> history(@PathVariable String id) {
        return chat.history(id);
    }

    public record RenameSessionRequest(String title) {}

    @PatchMapping("/sessions/{id}")
    public Conversation rename(@PathVariable String id, @RequestBody RenameSessionRequest req) {
        return chat.rename(id, req == null ? null : req.title());
    }

    public record ReorderSessionsRequest(List<String> orderedIds) {}

    @PostMapping("/sessions/reorder")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorder(@RequestBody ReorderSessionsRequest req) {
        chat.reorder(req == null ? null : req.orderedIds());
    }

    @DeleteMapping("/sessions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        chat.delete(id);
    }

    public record ChatRequest(
            String sessionId,
            String message,
            String agentId,
            String pageContext,
            Map<String, Boolean> permissions,
            List<String> images) {}

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestBody ChatRequest req, HttpServletRequest request) {
        return chat.chat(
                req.sessionId(),
                req.message(),
                req.agentId(),
                req.pageContext(),
                req.permissions(),
                req.images(),
                request.getRemoteAddr());
    }

    public record ActionResult(String status, String result) {}

    @PostMapping("/actions/{id}/result")
    public ActionProposal action(@PathVariable String id, @RequestBody ActionResult req) {
        return chat.result(id, req.status(), req.result());
    }
}
