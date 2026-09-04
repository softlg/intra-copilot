package com.intra.copilot.web;

import com.intra.copilot.model.AgentFeedback;
import com.intra.copilot.repo.AgentFeedbackRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class FeedbackController {
  private final AgentFeedbackRepository feedback;
  public FeedbackController(AgentFeedbackRepository feedback) { this.feedback = feedback; }
  public record FeedbackRequest(String sessionId, String messageId, Integer messageIndex, String agentId, String rating, String comment) {}
  @PostMapping("/feedback")
  @ResponseStatus(HttpStatus.CREATED)
  public AgentFeedback create(@RequestBody FeedbackRequest request) {
    if (request == null || !List.of("up", "down").contains(request.rating()))
      throw new IllegalArgumentException("反馈类型必须是 up 或 down");
    AgentFeedback item = new AgentFeedback();
    item.setSessionId(request.sessionId()); item.setMessageId(request.messageId());
    item.setMessageIndex(request.messageIndex()); item.setAgentId(request.agentId());
    item.setRating(request.rating()); item.setComment(request.comment());
    return feedback.save(item);
  }
  @GetMapping("/admin/agent-feedback")
  public List<AgentFeedback> list() { return feedback.findAllByOrderByCreatedAtDesc(); }
}
