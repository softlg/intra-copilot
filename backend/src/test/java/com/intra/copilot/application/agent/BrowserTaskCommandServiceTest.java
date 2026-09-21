package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskCommand;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskCommandRepository;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class BrowserTaskCommandServiceTest {

    @Test
    void hashesLeaseTokensWithoutPersistingRawValue() {
        String token = "lease-secret";
        String hash = BrowserTaskCommandService.tokenHash(token);

        assertEquals(64, hash.length());
        assertNotEquals(token, hash);
        assertEquals(hash, BrowserTaskCommandService.tokenHash(token));
    }

    @Test
    void recordsVerifiedCommandResult() {
        BrowserTaskCommandRepository commands = mock(BrowserTaskCommandRepository.class);
        BrowserTaskRepository tasks = mock(BrowserTaskRepository.class);
        BrowserTaskCommand command = new BrowserTaskCommand();
        command.setCommandId("BC1");
        command.setTaskId("BT1");
        command.setStatus(BrowserTaskCommand.RUNNING);
        command.setRuntimeInstanceId("runtime-1");
        command.setLeaseTokenHash(BrowserTaskCommandService.tokenHash("token-1"));
        BrowserTask task = new BrowserTask();
        task.setTaskId("BT1");
        task.setOwnerUserId("user-1");
        task.setProtocolVersion(1);
        when(commands.findById("BC1")).thenReturn(Optional.of(command));
        when(commands.save(any(BrowserTaskCommand.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(tasks.findById("BT1")).thenReturn(Optional.of(task));

        BrowserTaskCommandService service =
                new BrowserTaskCommandService(commands, tasks, new ObjectMapper(), 120);
        BrowserTaskCommand result =
                service.result(
                        "user-1",
                        "BC1",
                        "runtime-1",
                        "token-1",
                        1,
                        true,
                        true,
                        "{\"ok\":true}",
                        Map.of("url", "https://example.com"),
                        null);

        assertEquals(BrowserTaskCommand.COMPLETED, result.getStatus());
        assertEquals(Instant.class, result.getCompletedAt().getClass());
    }
}
