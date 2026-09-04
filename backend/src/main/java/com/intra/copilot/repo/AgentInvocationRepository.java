package com.intra.copilot.repo;

import com.intra.copilot.model.AgentInvocation;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentInvocationRepository extends JpaRepository<AgentInvocation, String> {
  List<AgentInvocation> findByConversationIdOrderByCreatedAtAsc(String conversationId);
}
