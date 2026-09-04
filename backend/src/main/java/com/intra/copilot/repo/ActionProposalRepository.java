package com.intra.copilot.repo;

import com.intra.copilot.model.ActionProposal;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActionProposalRepository extends JpaRepository<ActionProposal, String> {
  void deleteByConversationId(String conversationId);

  List<ActionProposal> findByConversationIdOrderByExpiresAtAsc(String conversationId);
}
