package com.intra.copilot.repo;

import com.intra.copilot.model.AgentInvocation;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentInvocationRepository extends JpaRepository<AgentInvocation, String> {}
