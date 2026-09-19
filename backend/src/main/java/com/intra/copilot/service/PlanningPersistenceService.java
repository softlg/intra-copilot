package com.intra.copilot.service;

import com.intra.copilot.model.AgentPlan;
import com.intra.copilot.model.AgentPlanStep;
import com.intra.copilot.repo.AgentPlanRepository;
import com.intra.copilot.repo.AgentPlanStepRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Persists a complete plan graph in one short transaction. */
@Service
public class PlanningPersistenceService {
    private final AgentPlanRepository plans;
    private final AgentPlanStepRepository steps;

    public PlanningPersistenceService(AgentPlanRepository plans, AgentPlanStepRepository steps) {
        this.plans = plans;
        this.steps = steps;
    }

    @Transactional
    public SavedPlan save(AgentPlan plan, List<AgentPlanStep> stepValues) {
        return saveInternal(plan, stepValues);
    }

    @Transactional
    public SavedPlan saveRevision(
            AgentPlan plan, List<AgentPlanStep> stepValues, AgentPlan previous) {
        previous.setStatus("SUPERSEDED");
        previous.setCompletedAt(Instant.now());
        previous.touch();
        plans.save(previous);
        return saveInternal(plan, stepValues);
    }

    private SavedPlan saveInternal(AgentPlan plan, List<AgentPlanStep> stepValues) {
        AgentPlan savedPlan = plans.save(plan);
        List<AgentPlanStep> savedSteps = new ArrayList<>();
        for (AgentPlanStep step : stepValues) {
            step.setPlanId(savedPlan.getId());
            savedSteps.add(steps.save(step));
        }
        return new SavedPlan(savedPlan, List.copyOf(savedSteps));
    }

    public record SavedPlan(AgentPlan plan, List<AgentPlanStep> steps) {}
}
