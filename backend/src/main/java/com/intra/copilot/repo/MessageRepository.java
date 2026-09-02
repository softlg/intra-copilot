package com.intra.copilot.repo;

import com.intra.copilot.model.Message;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageRepository extends JpaRepository<Message, String> {
  List<Message> findByConversationIdOrderByCreatedAtAsc(String id);
}
