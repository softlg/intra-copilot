package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskCommand;
import com.intra.copilot.domain.agent.BrowserTaskEvent;
import com.intra.copilot.domain.agent.BrowserTaskStatus;
import com.intra.copilot.infrastructure.persistence.agent.BrowserRuntimeInstanceRepository;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskCommandRepository;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskEventRepository;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Expires abandoned tasks and returns commands from disconnected runtimes to the queue. */
@Service
public class BrowserTaskMaintenanceService {
    private static final Logger log = LoggerFactory.getLogger(BrowserTaskMaintenanceService.class);

    private final BrowserTaskRepository tasks;
    private final BrowserTaskCommandRepository commands;
    private final BrowserTaskEventRepository events;
    private final BrowserRuntimeInstanceRepository runtimeInstances;
    private final BrowserTaskCommandService commandService;

    public BrowserTaskMaintenanceService(
            BrowserTaskRepository tasks,
            BrowserTaskCommandRepository commands,
            BrowserTaskEventRepository events,
            BrowserRuntimeInstanceRepository runtimeInstances,
            BrowserTaskCommandService commandService) {
        this.tasks = tasks;
        this.commands = commands;
        this.events = events;
        this.runtimeInstances = runtimeInstances;
        this.commandService = commandService;
    }

    @Scheduled(fixedDelayString = "${browser.runtime.maintenance-interval-ms:30000}")
    public void maintain() {
        Instant now = Instant.now();
        runtimeInstances.deleteStale(now.minus(Duration.ofDays(7)));
        for (BrowserTask task : tasks.findExpired(now, 200)) {
            String message = "浏览器任务已过期";
            task.setStatus(BrowserTaskStatus.EXPIRED.name());
            task.setError(message);
            task.setCompletedAt(now);
            task.setLeaseRuntimeInstanceId(null);
            task.setLeaseTokenHash(null);
            task.setLeaseExpiresAt(null);
            task.touch();
            tasks.save(task);
            commandService.failActive(task.getTaskId(), message);
            event(task, "TASK_EXPIRED", message);
        }
        for (BrowserTaskCommand command : commands.findExpiredActive(now, 500)) {
            if (command.getExpiresAt() != null && command.getExpiresAt().isAfter(now)) continue;
            command.setStatus(BrowserTaskCommand.FAILED);
            command.setError("浏览器命令执行超时");
            command.setCompletedAt(now);
            command.touch();
            commands.save(command);
            log.warn(
                    "Browser command expired taskId={} commandId={} type={}",
                    command.getTaskId(),
                    command.getCommandId(),
                    command.getActionType());
        }
    }

    private void event(BrowserTask task, String type, String message) {
        BrowserTaskEvent event = new BrowserTaskEvent();
        event.setTaskId(task.getTaskId());
        event.setSequenceNo(events.nextSequence(task.getTaskId()));
        event.setEventType(type);
        event.setStatus(task.getStatus());
        event.setPayload(
                "{\"message\":\"" + message.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}");
        events.save(event);
    }
}
