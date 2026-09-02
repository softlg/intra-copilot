package com.intra.copilot.repo;

import com.intra.copilot.model.AgentDefinition;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentDefinitionRepository extends JpaRepository<AgentDefinition, String> {
  List<AgentDefinition> findAllByEnabledTrueOrderByPriorityAscDisplayNameAsc();
}
