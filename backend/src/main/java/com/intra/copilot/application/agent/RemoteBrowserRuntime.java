package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.BrowserActionValidator;
import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskCommand;

/** Browser runtime backed by durable commands claimed by an external client. */
public abstract class RemoteBrowserRuntime implements BrowserRuntime {
    private final BrowserTaskCommandService commands;
    private final BrowserRuntimePresenceService presence;

    protected RemoteBrowserRuntime(
            BrowserTaskCommandService commands, BrowserRuntimePresenceService presence) {
        this.commands = commands;
        this.presence = presence;
    }

    @Override
    public boolean available() {
        return presence.online(kind());
    }

    @Override
    public boolean availableFor(BrowserTask task) {
        return presence.onlineForOwner(kind(), task == null ? null : task.getOwnerUserId());
    }

    @Override
    public boolean supports(BrowserInteractionMode interactionMode) {
        BrowserInteractionMode mode =
                interactionMode == null ? BrowserInteractionMode.FAST : interactionMode;
        return presence.supports(kind(), mode.name());
    }

    @Override
    public Observation observe(BrowserTask task) {
        BrowserActionValidator.NormalizedAction action =
                BrowserActionValidator.normalize(
                        """
                        {
                          "type":"SNAPSHOT",
                          "arguments":{},
                          "reason":"读取当前页面结构，决定下一步操作",
                          "risk":"low",
                          "readOnly":true
                        }
                        """);
        ActionResult result = execute(task, action);
        if (!result.ok() || result.observation() == null) {
            throw new IllegalStateException(result.error());
        }
        return result.observation();
    }

    @Override
    public ActionResult execute(
            BrowserTask task, BrowserActionValidator.NormalizedAction action) {
        try {
            BrowserTaskCommand command = commands.enqueue(task, action);
            BrowserTaskCommand finished =
                    commands.await(command, commands.taskCanceled(task.getTaskId()));
            return commands.toActionResult(finished);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return ActionResult.failed("浏览器 Runtime 等待被中断", null);
        } catch (Exception error) {
            return ActionResult.failed(
                    error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(),
                    null);
        }
    }

    @Override
    public void close(BrowserTask task) {
        commands.cancelActive(task.getTaskId(), "任务执行结束");
    }

    public abstract BrowserRuntimeKind kind();
}
