package com.intra.copilot.infrastructure.persistence.conversation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.domain.conversation.AgentFeedback;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;

class AgentFeedbackRepositoryTest {

    @Test
    void saveMergesIntoExistingVoteAfterConcurrentInsertConflict() {
        AgentFeedbackRepository repository = mock(AgentFeedbackRepository.class);
        doCallRealMethod().when(repository).save(any(AgentFeedback.class));

        AgentFeedback incoming = new AgentFeedback();
        incoming.setSource("extension");
        incoming.setUserId("user-1");
        incoming.setMessageId("message-1");
        incoming.setAgentId("agent-1");
        incoming.setRating("down");
        incoming.setReasonCode("INACCURATE");
        incoming.setStatus("ACTIVE");
        incoming.setRatedAt(Instant.parse("2026-09-15T03:00:00Z"));
        incoming.setUpdatedAt(Instant.parse("2026-09-15T03:00:00Z"));

        AgentFeedback existing = new AgentFeedback();
        existing.setSource("extension");
        existing.setUserId("user-1");
        existing.setMessageId("message-1");
        existing.setCreatedAt(Instant.parse("2026-09-15T02:59:59Z"));
        existing.setRating("up");

        when(repository.selectById(incoming.getId())).thenReturn(null);
        when(repository.insert(incoming)).thenThrow(new DuplicateKeyException("duplicate vote"));
        when(repository.findBySourceAndUserIdAndMessageId("extension", "user-1", "message-1"))
                .thenReturn(Optional.of(existing));
        when(repository.updateById(existing)).thenReturn(1);

        AgentFeedback saved = repository.save(incoming);

        assertSame(existing, saved);
        assertEquals("down", existing.getRating());
        assertEquals("INACCURATE", existing.getReasonCode());
        assertEquals(Instant.parse("2026-09-15T02:59:59Z"), existing.getCreatedAt());
        assertEquals(Instant.parse("2026-09-15T03:00:00Z"), existing.getRatedAt());
        verify(repository).updateById(existing);
    }
}
