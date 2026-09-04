package com.intra.copilot.repo;

import com.intra.copilot.model.AgentFeedback;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentFeedbackRepository extends JpaRepository<AgentFeedback, String> {
  List<AgentFeedback> findAllByOrderByCreatedAtDesc();
}
