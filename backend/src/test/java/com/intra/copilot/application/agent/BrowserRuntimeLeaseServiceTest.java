package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskCommand;
import com.intra.copilot.domain.agent.BrowserTaskStatus;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class BrowserRuntimeLeaseServiceTest {

    @Test
    void claimsTaskAndReturnsPendingCommand() {
        BrowserTaskRepository tasks = mock(BrowserTaskRepository.class);
        BrowserTaskCommandService commands = mock(BrowserTaskCommandService.class);
        BrowserRuntimePresenceService presence = mock(BrowserRuntimePresenceService.class);
        BrowserTask task = task();
        BrowserTaskCommand command = new BrowserTaskCommand();
        command.setCommandId("BC1");
        command.setTaskId(task.getTaskId());
        command.setSequenceNo(1);
        command.setActionType("SNAPSHOT");
        command.setActionJson(
                """
                {"type":"SNAPSHOT","arguments":{},"reason":"观察页面","risk":"low","readOnly":true}
                """);
        when(tasks.findLeasedByRuntime("runtime-1")).thenReturn(Optional.empty());
        when(tasks.findClaimable(eq("user-1"), eq("EXTENSION"), any(Instant.class), eq(25)))
                .thenReturn(List.of(task));
        when(tasks.claim(
                        eq(task.getTaskId()),
                        eq("runtime-1"),
                        any(String.class),
                        any(Instant.class),
                        any(Instant.class)))
                .thenReturn(1);
        when(tasks.findById(task.getTaskId())).thenReturn(Optional.of(task));
        when(tasks.renew(
                        eq(task.getTaskId()),
                        eq("runtime-1"),
                        any(String.class),
                        any(Instant.class),
                        any(Instant.class)))
                .thenReturn(1);
        when(commands.claimFor(
                        eq(task),
                        eq("runtime-1"),
                        any(String.class)))
                .thenReturn(command);

        BrowserRuntimeLeaseService service =
                new BrowserRuntimeLeaseService(tasks, commands, presence, 45);
        BrowserRuntimeLeaseService.LeaseView lease =
                service.claim(
                        "user-1",
                        new BrowserRuntimeLeaseService.ClaimRequest(
                                "EXTENSION",
                                "runtime-1",
                                1,
                                "0.2.1",
                                List.of("SNAPSHOT", "CLICK"),
                                List.of("VISIBLE_VIRTUAL"),
                                "https://example.com",
                                null));

        assertNotNull(lease);
        assertEquals(task.getTaskId(), lease.taskId());
        assertNotNull(lease.leaseToken());
        assertNotNull(lease.command());
        assertEquals("SNAPSHOT", lease.command().actionType());
    }

    @Test
    void rejectsIncompatibleProtocolVersion() {
        BrowserRuntimeLeaseService service =
                new BrowserRuntimeLeaseService(
                        mock(BrowserTaskRepository.class),
                        mock(BrowserTaskCommandService.class),
                        mock(BrowserRuntimePresenceService.class),
                        45);

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service.claim(
                                "user-1",
                                new BrowserRuntimeLeaseService.ClaimRequest(
                                        "EXTENSION",
                                        "runtime-1",
                                        2,
                                        "9.0.0",
                                        List.of(),
                                        List.of(),
                                        "",
                                        null)));
    }

    private BrowserTask task() {
        BrowserTask task = new BrowserTask();
        task.setOwnerUserId("user-1");
        task.setCapability(SystemAgentCatalog.BROWSER_OPERATE);
        task.setRuntimeKind(BrowserRuntimeKind.EXTENSION.name());
        task.setInteractionMode(BrowserInteractionMode.VISIBLE_VIRTUAL.name());
        task.setStatus(BrowserTaskStatus.CREATED.name());
        task.setGoal("读取页面");
        task.setAllowedOrigins("[\"https://example.com\"]");
        return task;
    }
}
