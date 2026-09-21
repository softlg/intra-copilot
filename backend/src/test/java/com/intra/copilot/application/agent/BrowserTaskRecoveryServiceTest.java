package com.intra.copilot.application.agent;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskStatus;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class BrowserTaskRecoveryServiceTest {

    @Test
    void resumesTaskThatWasNeverQueued() {
        BrowserTaskRepository tasks = mock(BrowserTaskRepository.class);
        BrowserTaskService browserTasks = mock(BrowserTaskService.class);
        BrowserTask task = task(BrowserTaskStatus.CREATED);
        when(tasks.findRecoverable(
                        any(Instant.class), any(Instant.class), any(Instant.class), eq(100)))
                .thenReturn(List.of(task));
        BrowserTaskRecoveryService service = new BrowserTaskRecoveryService(tasks, browserTasks);

        service.recover();

        verify(browserTasks).resume(task.getTaskId());
    }

    @Test
    void requeuesTaskWhoseWorkerStopped() {
        BrowserTaskRepository tasks = mock(BrowserTaskRepository.class);
        BrowserTaskService browserTasks = mock(BrowserTaskService.class);
        BrowserTask task = task(BrowserTaskStatus.QUEUED);
        when(tasks.findRecoverable(
                        any(Instant.class), any(Instant.class), any(Instant.class), eq(100)))
                .thenReturn(List.of(task));
        when(tasks.requeue(
                        eq(task.getTaskId()),
                        eq(BrowserTaskStatus.QUEUED.name()),
                        any(Instant.class)))
                .thenReturn(1);
        BrowserTaskRecoveryService service = new BrowserTaskRecoveryService(tasks, browserTasks);

        service.recover();

        verify(tasks)
                .requeue(
                        eq(task.getTaskId()),
                        eq(BrowserTaskStatus.QUEUED.name()),
                        any(Instant.class));
        verify(browserTasks).resume(task.getTaskId());
    }

    private BrowserTask task(BrowserTaskStatus status) {
        BrowserTask task = new BrowserTask();
        task.setOwnerUserId("user-1");
        task.setGoal("执行页面任务");
        task.setStatus(status.name());
        return task;
    }
}
