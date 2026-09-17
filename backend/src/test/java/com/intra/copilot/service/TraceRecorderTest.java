package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentInvocationEvent;
import com.intra.copilot.repo.AgentInvocationEventRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class TraceRecorderTest {

    @Test
    void resumesInvocationSequenceFromPersistedMaximum() {
        AgentInvocationEventRepository events = mock(AgentInvocationEventRepository.class);
        when(events.nextSequence("invocation-1")).thenReturn(8);
        when(events.nextGlobalSequence("trace-1")).thenReturn(20L, 21L);
        when(events.save(org.mockito.ArgumentMatchers.any(AgentInvocationEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        TraceRecorder recorder =
                new TraceRecorder(events, new ObjectMapper(), new SimpleMeterRegistry());

        TraceContext.open("trace-1", "turn-1", 1, "request-1", "invocation-1");
        AgentInvocationEvent first;
        AgentInvocationEvent second;
        try {
            first =
                    recorder.event("invocation-1", "correlation-1", TraceRecorder.Type.AGENT_START)
                            .save();
            second =
                    recorder.event("invocation-1", "correlation-1", TraceRecorder.Type.AGENT_END)
                            .save();
        } finally {
            TraceContext.clear();
        }

        assertEquals(8, first.getSequence());
        assertEquals(9, second.getSequence());
        assertEquals(20L, first.getSequenceGlobal());
        assertEquals(21L, second.getSequenceGlobal());
    }
}
