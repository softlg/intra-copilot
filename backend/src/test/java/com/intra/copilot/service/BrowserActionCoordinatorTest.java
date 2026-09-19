package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.ActionProposal;
import com.intra.copilot.model.AgentInvocation;
import com.intra.copilot.repo.ActionProposalRepository;
import com.intra.copilot.repo.AgentInvocationRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class BrowserActionCoordinatorTest {

    @Test
    void resolvesOnlyOnePendingActionResult() {
        ActionProposalRepository actions = mock(ActionProposalRepository.class);
        AgentInvocationRepository invocations = mock(AgentInvocationRepository.class);
        TraceRecorder trace = mock(TraceRecorder.class, RETURNS_DEEP_STUBS);
        ActionProposal pending = proposal("PENDING", null);
        String actionId = pending.getActionId();
        ActionProposal executed = proposal("EXECUTED", "ok");
        when(actions.findById(actionId)).thenReturn(Optional.of(pending), Optional.of(executed));
        when(actions.resolvePending(actionId, "EXECUTED", "ok")).thenReturn(1);
        AgentInvocation invocation = new AgentInvocation();
        invocation.setTraceId("TR-1");
        when(invocations.findById("AI-1")).thenReturn(Optional.of(invocation));
        BrowserActionCoordinator coordinator =
                new BrowserActionCoordinator(actions, invocations, trace, 300);

        ActionProposal result = coordinator.resolve(actionId, "EXECUTED", "ok");

        assertEquals("EXECUTED", result.getStatus());
        verify(actions).resolvePending(actionId, "EXECUTED", "ok");
    }

    @Test
    void doesNotOverwriteAnAlreadyResolvedAction() {
        ActionProposalRepository actions = mock(ActionProposalRepository.class);
        AgentInvocationRepository invocations = mock(AgentInvocationRepository.class);
        ActionProposal executed = proposal("EXECUTED", "first");
        when(actions.findById(executed.getActionId())).thenReturn(Optional.of(executed));
        BrowserActionCoordinator coordinator =
                new BrowserActionCoordinator(
                        actions, invocations, mock(TraceRecorder.class, RETURNS_DEEP_STUBS), 300);

        ActionProposal result = coordinator.resolve(executed.getActionId(), "REJECTED", "second");

        assertEquals("EXECUTED", result.getStatus());
        verify(actions, never()).resolvePending(anyString(), anyString(), any());
    }

    private static ActionProposal proposal(String status, String result) {
        ActionProposal proposal = new ActionProposal();
        proposal.setConversationId("SS-1");
        proposal.setInvocationId("AI-1");
        proposal.setTraceId("TR-1");
        proposal.setType("CLICK");
        proposal.setReason("test");
        proposal.setRisk("low");
        proposal.setStatus(status);
        proposal.setResult(result);
        proposal.setExpiresAt(Instant.now().plusSeconds(60));
        return proposal;
    }
}
