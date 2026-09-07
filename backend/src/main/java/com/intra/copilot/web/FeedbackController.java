package com.intra.copilot.web;

import com.intra.copilot.model.AgentFeedback;
import com.intra.copilot.repo.AgentFeedbackRepository;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class FeedbackController {
  private final AgentFeedbackRepository feedback;

  public FeedbackController(AgentFeedbackRepository feedback) {
    this.feedback = feedback;
  }

  public record FeedbackRequest(
      String sessionId,
      String messageId,
      Integer messageIndex,
      String agentId,
      String rating,
      String comment,
      String messageContent,
      String userMessage) {}

  @PostMapping("/feedback")
  @ResponseStatus(HttpStatus.CREATED)
  public AgentFeedback create(@RequestBody FeedbackRequest request) {
    if (request == null || !List.of("up", "down").contains(request.rating()))
      throw new IllegalArgumentException("反馈类型必须是 up 或 down");
    AgentFeedback item = new AgentFeedback();
    item.setSessionId(request.sessionId());
    item.setMessageId(request.messageId());
    item.setMessageIndex(request.messageIndex());
    item.setAgentId(request.agentId());
    item.setRating(request.rating());
    item.setComment(request.comment());
    item.setMessageContent(limit(request.messageContent(), 12000));
    item.setUserMessage(limit(request.userMessage(), 4000));
    return feedback.save(item);
  }

  @GetMapping("/admin/agent-feedback")
  public List<AgentFeedback> list() {
    return feedback.findAllByOrderByCreatedAtDesc();
  }

  @GetMapping("/admin/agent-feedback/summary")
  public Map<String, Object> summary() {
    List<AgentFeedback> all = feedback.findAllByOrderByCreatedAtDesc();
    long up = all.stream().filter(item -> "up".equals(item.getRating())).count();
    long down = all.size() - up;
    Map<String, Long> byAgent =
        all.stream()
            .collect(
                Collectors.groupingBy(
                    item -> item.getAgentId() == null ? "unknown" : item.getAgentId(),
                    LinkedHashMap::new,
                    Collectors.counting()));
    Map<String, Long> downReasons =
        all.stream()
            .filter(item -> "down".equals(item.getRating()))
            .map(AgentFeedback::getComment)
            .filter(value -> value != null && !value.isBlank())
            .map(String::trim)
            .collect(
                Collectors.groupingBy(value -> value, LinkedHashMap::new, Collectors.counting()));
    List<String> suggestions = new ArrayList<>();
    if (down > 0 && downReasons.isEmpty()) suggestions.add("补充踩反馈原因，便于定位回答质量问题。");
    if (downReasons
        .keySet()
        .stream()
        .anyMatch(
            value ->
                value.contains("不准确")
                    || value.contains("错误")
                    || value.toLowerCase().contains("wrong")))
      suggestions.add("检查 Agent 的知识库绑定、引用来源和事实核验提示词。");
    if (downReasons
        .keySet()
        .stream()
        .anyMatch(
            value ->
                value.contains("不相关")
                    || value.contains("跑题")
                    || value.toLowerCase().contains("irrelevant")))
      suggestions.add("优化意图路由规则，并要求 Agent 先复述问题再回答。");
    if (downReasons
        .keySet()
        .stream()
        .anyMatch(
            value ->
                value.contains("太长")
                    || value.contains("冗长")
                    || value.toLowerCase().contains("long")))
      suggestions.add("在系统提示词中增加简洁回答和分层摘要要求。");
    if (suggestions.isEmpty() && down > 0)
      suggestions.add("查看具体踩反馈中的用户问题、Agent 回复和原因，针对高频问题补充提示词或知识库内容。");
    return Map.of(
        "total",
        all.size(),
        "up",
        up,
        "down",
        down,
        "satisfactionRate",
        all.isEmpty() ? 0 : Math.round(up * 1000d / all.size()) / 10d,
        "byAgent",
        byAgent,
        "downReasons",
        downReasons,
        "suggestions",
        suggestions);
  }

  private String limit(String value, int max) {
    return value == null ? null : value.length() <= max ? value : value.substring(0, max);
  }
}
