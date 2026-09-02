package com.intra.copilot.web;

import com.intra.copilot.agent.*;
import com.intra.copilot.model.*;
import com.intra.copilot.service.ChatService;
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
  private final DiagnosisAgent diagnosis;
  private final TmsManualAgent tms;

  public ApiController(ChatService c, GeneralAgent g, DiagnosisAgent d, TmsManualAgent t) {
    chat = c;
    general = g;
    diagnosis = d;
    tms = t;
  }

  @GetMapping("/agents")
  public List<Map<String, Object>> agents() {
    return List.of(
        Map.of(
            "id",
            general.id(),
            "displayName",
            general.displayName(),
            "description",
            general.description()),
        Map.of("id", "router", "displayName", "自动分发", "description", "根据问题选择最合适的 Agent"),
        Map.of(
            "id",
            diagnosis.id(),
            "displayName",
            diagnosis.displayName(),
            "description",
            diagnosis.description()),
        Map.of("id", tms.id(), "displayName", tms.displayName(), "description", tms.description()));
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
      Map<String, Boolean> permissions) {}

  @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream(@RequestBody ChatRequest req) {
    return chat.chat(
        req.sessionId(), req.message(), req.agentId(), req.pageContext(), req.permissions());
  }

  public record ActionResult(String status, String result) {}

  @PostMapping("/actions/{id}/result")
  public ActionProposal action(@PathVariable String id, @RequestBody ActionResult req) {
    return chat.result(id, req.status(), req.result());
  }
}
