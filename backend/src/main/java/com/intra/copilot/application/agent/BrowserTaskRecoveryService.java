package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskStatus;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Requeues tasks whose worker exited before publishing a terminal state. */
@Service
public class BrowserTaskRecoveryService {
    private static final Logger log = LoggerFactory.getLogger(BrowserTaskRecoveryService.class);

    private final BrowserTaskRepository tasks;
    private final BrowserTaskService browserTasks;

    public BrowserTaskRecoveryService(
            BrowserTaskRepository tasks, BrowserTaskService browserTasks) {
        this.tasks = tasks;
        this.browserTasks = browserTasks;
    }

    @Scheduled(fixedDelayString = "${browser.runtime.recovery-interval-ms:15000}")
    public void recover() {
        Instant now = Instant.now();
        List<BrowserTask> recoverable =
                tasks.findRecoverable(
                        now.minus(Duration.ofSeconds(5)),
                        now.minus(Duration.ofSeconds(30)),
                        now.minus(Duration.ofMinutes(10)),
                        100);
        for (BrowserTask task : recoverable) {
            if (task.statusValue() == BrowserTaskStatus.CREATED) {
                browserTasks.resume(task.getTaskId());
                continue;
            }
            if (tasks.requeue(task.getTaskId(), task.getStatus(), now) == 1) {
                log.warn(
                        "Recovered stale browser task taskId={} previousStatus={}",
                        task.getTaskId(),
                        task.getStatus());
                browserTasks.resume(task.getTaskId());
            }
        }
    }
}
