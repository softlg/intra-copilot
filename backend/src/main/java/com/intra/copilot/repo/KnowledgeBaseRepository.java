package com.intra.copilot.repo;

import com.intra.copilot.model.KnowledgeBase;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface KnowledgeBaseRepository extends JpaRepository<KnowledgeBase, String> {
  List<KnowledgeBase> findAllByOrderByUpdatedAtDesc();
}
