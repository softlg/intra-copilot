package com.intra.copilot.repo;

import com.intra.copilot.model.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationRepository extends JpaRepository<Conversation, String> {}
