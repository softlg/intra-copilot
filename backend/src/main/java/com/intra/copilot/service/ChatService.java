package com.intra.copilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.agent.*;
import com.intra.copilot.model.*;
import com.intra.copilot.repo.*;
import java.io.IOException;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class ChatService {
  private final ConversationRepository conversations;
  private final MessageRepository messages;
  private final ActionProposalRepository actions;
  private final RouterAgent router;
  private final DiagnosisAgent diagnosis;
  private final TmsManualAgent tms;
  private final LlmClient llm;
  private final ObjectMapper json = new ObjectMapper();

  public ChatService(
      ConversationRepository c,
      MessageRepository m,
      ActionProposalRepository a,
      RouterAgent r,
      DiagnosisAgent d,
      TmsManualAgent t,
      LlmClient l) {
    conversations = c;
    messages = m;
    actions = a;
    router = r;
    diagnosis = d;
    tms = t;
    llm = l;
  }

  public Conversation create() {
    return conversations.save(new Conversation());
  }

  public List<Conversation> list() {
    return conversations.findAll();
  }

  public List<Message> history(String id) {
    return messages.findByConversationIdOrderByCreatedAtAsc(id);
  }

  public Conversation rename(String id, String title) {
    Conversation conversation =
        conversations.findById(id).orElseThrow(() -> new NoSuchElementException("会话不存在"));
    String normalized = title == null ? "" : title.trim();
    if (normalized.isEmpty() || normalized.length() > 80) {
      throw new IllegalArgumentException("会话名称不能为空且不能超过 80 个字符");
    }
    conversation.setTitle(normalized);
    conversation.touch();
    return conversations.save(conversation);
  }

  public void delete(String id) {
    if (!conversations.existsById(id)) {
      throw new NoSuchElementException("会话不存在");
    }
    messages.deleteByConversationId(id);
    actions.deleteByConversationId(id);
    conversations.deleteById(id);
  }

  public SseEmitter chat(String sessionId, String text, String requestedAgent, String pageContext) {
    Conversation c = conversations.findById(sessionId).orElseGet(this::create);
    Agent agent =
        requestedAgent == null || requestedAgent.isBlank()
            ? router.route(text)
            : ("diagnosis".equals(requestedAgent) ? diagnosis : tms);
    SseEmitter out = new SseEmitter(120000L);
    messages.save(
        new Message(c.getId(), "user", text, agent == null ? "router" : agent.id(), pageContext));
    try {
      out.send(
          SseEmitter.event()
              .name("agent_selected")
              .data(
                  agent == null
                      ? Map.of("agentId", "router", "needsClarification", true)
                      : Map.of("agentId", agent.id(), "displayName", agent.displayName())));
    } catch (IOException ignored) {
    }
    if (agent == null) {
      String answer = "我可以帮你做问题诊断或 TMS 操作说明。请补充你的目标，或在顶部选择 Agent。";
      messages.save(new Message(c.getId(), "assistant", answer, "router", null));
      try {
        out.send(SseEmitter.event().name("token").data(answer));
        out.send(SseEmitter.event().name("message_completed").data(Map.of("content", answer)));
        out.complete();
      } catch (IOException e) {
        out.completeWithError(e);
      }
      return out;
    }
    List<Map<String, String>> h =
        history(c.getId())
            .stream()
            .limit(20)
            .map(x -> Map.of("role", x.getRole(), "content", x.getContent()))
            .toList();
    String enriched =
        pageContext == null || pageContext.isBlank()
            ? text
            : text + "\n\n浏览器上下文（仅供分析）：\n" + pageContext;
    StringBuilder full = new StringBuilder();
    llm.stream(agent.systemPrompt(), h, enriched)
        .subscribe(
            token -> {
              full.append(token);
              try {
                out.send(SseEmitter.event().name("token").data(token));
              } catch (IOException e) {
                out.completeWithError(e);
              }
            },
            out::completeWithError,
            () -> {
              messages.save(new Message(c.getId(), "assistant", full.toString(), agent.id(), null));
              try {
                ActionProposal proposal = parseProposal(c.getId(), full.toString());
                if (proposal != null)
                  out.send(
                      SseEmitter.event()
                          .name("action_proposed")
                          .data(
                              Map.of(
                                  "actionId",
                                  proposal.getActionId(),
                                  "type",
                                  proposal.getType(),
                                  "target",
                                  proposal.getTarget(),
                                  "arguments",
                                  proposal.getArguments(),
                                  "reason",
                                  proposal.getReason(),
                                  "risk",
                                  proposal.getRisk(),
                                  "expiresAt",
                                  proposal.getExpiresAt().toString())));
                out.send(
                    SseEmitter.event()
                        .name("message_completed")
                        .data(Map.of("content", full.toString())));
                out.complete();
              } catch (IOException e) {
                out.completeWithError(e);
              }
            });
    return out;
  }

  private ActionProposal parseProposal(String conversationId, String text) {
    try {
      int s = text.indexOf("{\"type\"");
      if (s < 0) return null;
      int e = text.indexOf('}', s);
      if (e < 0) return null;
      var n = json.readTree(text.substring(s, e + 1));
      String type = n.path("type").asText();
      if (!List.of("CLICK", "FILL", "NAVIGATE").contains(type)) return null;
      ActionProposal a = new ActionProposal();
      a.setConversationId(conversationId);
      a.setType(type);
      a.setTarget(n.path("target").asText(""));
      a.setArguments(n.path("arguments").toString());
      a.setReason(n.path("reason").asText("需要用户确认的页面操作"));
      a.setRisk(n.path("risk").asText("medium"));
      a.setExpiresAt(Instant.now().plusSeconds(300));
      return actions.save(a);
    } catch (Exception e) {
      return null;
    }
  }

  public ActionProposal result(String id, String status, String result) {
    ActionProposal a = actions.findById(id).orElseThrow();
    if (a.getExpiresAt() != null && a.getExpiresAt().isBefore(Instant.now())) {
      a.setStatus("EXPIRED");
    } else {
      a.setStatus(status);
      a.setResult(result);
    }
    return actions.save(a);
  }
}
