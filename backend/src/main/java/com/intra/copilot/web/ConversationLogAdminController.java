package com.intra.copilot.web;

import com.intra.copilot.model.ActionProposal;
import com.intra.copilot.model.AgentInvocation;
import com.intra.copilot.model.Conversation;
import com.intra.copilot.model.Message;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read-only admin view of the complete per-session assistant execution trail. */
@RestController
@RequestMapping("/api/v1/admin/conversation-logs")
public class ConversationLogAdminController {
  private final ConversationRepository conversations;
  private final MessageRepository messages;
  private final AgentInvocationRepository invocations;
  private final ActionProposalRepository actions;

  public ConversationLogAdminController(
      ConversationRepository conversations,
      MessageRepository messages,
      AgentInvocationRepository invocations,
      ActionProposalRepository actions) {
    this.conversations = conversations;
    this.messages = messages;
    this.invocations = invocations;
    this.actions = actions;
  }

  @GetMapping
  public List<ConversationLog> list() {
    return conversations.findAllByOrderByUpdatedAtDesc().stream()
        .map(
            conversation ->
                new ConversationLog(
                    conversation,
                    messages.findByConversationIdOrderByCreatedAtAsc(conversation.getId()),
                    invocations.findByConversationIdOrderByCreatedAtAsc(conversation.getId()),
                    actions.findByConversationIdOrderByExpiresAtAsc(conversation.getId())))
        .toList();
  }

  public record ConversationLog(
      String id,
      String title,
      Instant createdAt,
      Instant updatedAt,
      List<Message> messages,
      List<AgentInvocation> invocations,
      List<ActionProposal> actions) {
    ConversationLog(
        Conversation conversation,
        List<Message> messages,
        List<AgentInvocation> invocations,
        List<ActionProposal> actions) {
      this(
          conversation.getId(),
          conversation.getTitle(),
          conversation.getCreatedAt(),
          conversation.getUpdatedAt(),
          messages,
          invocations,
          actions);
    }
  }
}
