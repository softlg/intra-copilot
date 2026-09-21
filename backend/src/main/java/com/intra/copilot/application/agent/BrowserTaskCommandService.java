package com.intra.copilot.application.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.BrowserActionValidator;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskCommand;
import com.intra.copilot.domain.agent.BrowserTaskStatus;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskCommandRepository;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Durable command queue used by extension and embedded browser runtimes. */
@Service
public class BrowserTaskCommandService {
    private final BrowserTaskCommandRepository commands;
    private final BrowserTaskRepository tasks;
    private final ObjectMapper json;
    private final Duration commandTimeout;

    public BrowserTaskCommandService(
            BrowserTaskCommandRepository commands,
            BrowserTaskRepository tasks,
            ObjectMapper json,
            @Value("${browser.runtime.command-timeout-seconds:120}") long commandTimeoutSeconds) {
        this.commands = commands;
        this.tasks = tasks;
        this.json = json;
        this.commandTimeout = Duration.ofSeconds(Math.max(15L, Math.min(900L, commandTimeoutSeconds)));
    }

    public BrowserTaskCommand enqueue(BrowserTask task, BrowserActionValidator.NormalizedAction action) {
        BrowserTaskCommand command = new BrowserTaskCommand();
        command.setTaskId(task.getTaskId());
        command.setSequenceNo(commands.nextSequence(task.getTaskId()));
        command.setActionJson(action.fullJson());
        command.setActionType(action.type());
        command.setStatus(BrowserTaskCommand.PENDING);
        command.setExpiresAt(Instant.now().plus(commandTimeout));
        return commands.save(command);
    }

    public BrowserTaskCommand await(
            BrowserTaskCommand command, BooleanSupplier canceled) throws InterruptedException {
        Instant deadline = command.getExpiresAt();
        for (;;) {
            BrowserTaskCommand current =
                    commands
                            .findById(command.getCommandId())
                            .orElseThrow(() -> new NoSuchElementException("浏览器命令不存在"));
            if (current.terminal()) return current;
            if (canceled != null && canceled.getAsBoolean()) {
                current.setStatus(BrowserTaskCommand.CANCELED);
                current.setError("任务已取消");
                current.setCompletedAt(Instant.now());
                current.touch();
                return commands.save(current);
            }
            if (Instant.now().isAfter(deadline)) {
                current.setStatus(BrowserTaskCommand.FAILED);
                current.setError("浏览器 Runtime 响应超时");
                current.setCompletedAt(Instant.now());
                current.touch();
                return commands.save(current);
            }
            TimeUnit.MILLISECONDS.sleep(120L);
        }
    }

    public BrowserTaskCommand result(
            String ownerUserId,
            String commandId,
            String runtimeInstanceId,
            String leaseToken,
            int protocolVersion,
            boolean ok,
            boolean verified,
            String result,
            Map<String, Object> observation,
            String error) {
        BrowserTaskCommand command =
                commands
                        .findById(commandId)
                        .orElseThrow(() -> new NoSuchElementException("浏览器命令不存在"));
        BrowserTask task =
                tasks.findById(command.getTaskId())
                        .orElseThrow(() -> new NoSuchElementException("浏览器任务不存在"));
        if (!ownerUserId.equals(task.getOwnerUserId())) {
            throw new NoSuchElementException("浏览器命令不存在");
        }
        if (command.terminal()) return command;
        if (protocolVersion != task.getProtocolVersion()) {
            throw new IllegalArgumentException("浏览器 Runtime 协议版本不匹配");
        }
        if (!runtimeInstanceId.equals(command.getRuntimeInstanceId())
                || !tokenHash(leaseToken).equals(command.getLeaseTokenHash())) {
            throw new IllegalArgumentException("浏览器命令租约无效");
        }
        command.setStatus(ok && verified ? BrowserTaskCommand.COMPLETED : BrowserTaskCommand.FAILED);
        command.setResultJson(writeJson(result == null ? Map.of() : safeJson(result)));
        command.setObservationJson(writeJson(observation == null ? Map.of() : observation));
        command.setError(ok && verified ? null : trim(error, "浏览器动作未通过验证"));
        command.setCompletedAt(Instant.now());
        command.setActionJson(redactedAction(command.getActionType(), command.getActionJson()));
        command.touch();
        return commands.save(command);
    }

    public void cancelActive(String taskId, String reason) {
        for (BrowserTaskCommand command : commands.findActiveForTask(taskId)) {
            command.setStatus(BrowserTaskCommand.CANCELED);
            command.setError(trim(reason, "任务已取消"));
            command.setCompletedAt(Instant.now());
            command.touch();
            commands.save(command);
        }
    }

    public void failActive(String taskId, String reason) {
        for (BrowserTaskCommand command : commands.findActiveForTask(taskId)) {
            command.setStatus(BrowserTaskCommand.FAILED);
            command.setError(trim(reason, "浏览器任务已结束"));
            command.setCompletedAt(Instant.now());
            command.touch();
            commands.save(command);
        }
    }

    public BrowserTaskCommand claimFor(
            BrowserTask task,
            String runtimeInstanceId,
            String leaseTokenHash) {
        for (;;) {
            BrowserTaskCommand pending =
                    commands.nextPending(task.getTaskId()).orElse(null);
            if (pending == null) return null;
            int changed =
                    commands.transition(
                            pending.getCommandId(),
                            BrowserTaskCommand.PENDING,
                            BrowserTaskCommand.RUNNING,
                            runtimeInstanceId,
                            leaseTokenHash,
                            Instant.now(),
                            pending.getExpiresAt());
            if (changed == 1) {
                return commands.findById(pending.getCommandId()).orElse(pending);
            }
        }
    }

    public BrowserRuntime.ActionResult toActionResult(BrowserTaskCommand command) {
        BrowserRuntime.Observation observation = readObservation(command.getObservationJson());
        String result = command.getResultJson() == null ? "{}" : command.getResultJson();
        if (BrowserTaskCommand.COMPLETED.equals(command.getStatus())) {
            return BrowserRuntime.ActionResult.completed(observation, result);
        }
        return BrowserRuntime.ActionResult.failed(
                trim(command.getError(), "浏览器动作失败"), observation);
    }

    public BooleanSupplier taskCanceled(String taskId) {
        return () ->
                tasks.findById(taskId)
                        .map(task -> task.statusValue() == BrowserTaskStatus.CANCELED)
                        .orElse(true);
    }

    private BrowserRuntime.Observation readObservation(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            Map<String, Object> value =
                    json.readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<>() {});
            return new BrowserRuntime.Observation(
                    text(value.get("snapshotId")),
                    value.get("frameId") instanceof Number number ? number.intValue() : 0,
                    text(value.get("url")),
                    text(value.get("title")),
                    text(value.get("visibleText")),
                    text(value.get("domSummary")),
                    value.get("frames") instanceof java.util.List<?> list
                            ? list.stream()
                                    .filter(Map.class::isInstance)
                                    .map(item -> (Map<String, Object>) item)
                                    .toList()
                            : java.util.List.of());
        } catch (Exception ignored) {
            return null;
        }
    }

    private Object safeJson(String value) {
        try {
            return json.readTree(value);
        } catch (Exception ignored) {
            return Map.of("raw", value);
        }
    }

    private String writeJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalArgumentException("浏览器命令结果无法序列化", error);
        }
    }

    public static String tokenHash(String token) {
        if (token == null || token.isBlank()) return "";
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of()
                    .formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("无法计算租约摘要", error);
        }
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String trim(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static String redactedAction(String type, String actionJson) {
        if (type == null || actionJson == null || actionJson.isBlank()) return actionJson;
        if (!List.of("TYPE", "FILL", "SET_EDITOR", "UPLOAD").contains(type)) {
            return actionJson;
        }
        return "{\"type\":\"" + type + "\",\"redacted\":true}";
    }
}
