package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeInstance;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskCommand;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Claims durable browser tasks for an online extension or embedded runtime. */
@Service
public class BrowserRuntimeLeaseService {
    public static final int PROTOCOL_VERSION = 1;
    private final BrowserTaskRepository tasks;
    private final BrowserTaskCommandService commands;
    private final BrowserRuntimePresenceService presence;
    private final Duration leaseDuration;

    public BrowserRuntimeLeaseService(
            BrowserTaskRepository tasks,
            BrowserTaskCommandService commands,
            BrowserRuntimePresenceService presence,
            @Value("${browser.runtime.lease-seconds:45}") long leaseSeconds) {
        this.tasks = tasks;
        this.commands = commands;
        this.presence = presence;
        this.leaseDuration = Duration.ofSeconds(Math.max(20L, Math.min(300L, leaseSeconds)));
    }

    public BrowserRuntimeInstance reportPresence(
            String ownerUserId, BrowserRuntimePresenceService.Report request) {
        return presence.report(
                ownerUserId,
                request.runtimeInstanceId(),
                BrowserRuntimeKind.from(request.runtimeKind()),
                request.protocolVersion(),
                request.runtimeVersion(),
                request.supportedActions(),
                request.interactionModes(),
                request.currentUrl());
    }

    public LeaseView claim(String ownerUserId, ClaimRequest request) {
        BrowserRuntimeKind kind = BrowserRuntimeKind.from(request.runtimeKind());
        if (!List.of(BrowserRuntimeKind.EXTENSION, BrowserRuntimeKind.EMBEDDED).contains(kind)) {
            throw new IllegalArgumentException("只有 EXTENSION 或 EMBEDDED Runtime 可以领取任务");
        }
        if (request.protocolVersion() != PROTOCOL_VERSION) {
            throw new IllegalArgumentException("浏览器 Runtime 协议版本不兼容，请升级后重试");
        }
        presence.report(
                ownerUserId,
                request.runtimeInstanceId(),
                kind,
                request.protocolVersion(),
                request.runtimeVersion(),
                request.supportedActions(),
                request.interactionModes(),
                request.currentUrl());
        Instant now = Instant.now();
        BrowserTask task =
                tasks.findLeasedByRuntime(request.runtimeInstanceId())
                        .filter(value -> value.runtimeKind() == kind)
                        .filter(
                                value ->
                                        request.leaseToken() == null
                                                || BrowserTaskCommandService.tokenHash(
                                                                request.leaseToken())
                                                        .equals(value.getLeaseTokenHash()))
                        .orElse(null);
        String leaseToken = request.leaseToken();
        if (task == null) {
            List<BrowserTask> candidates = tasks.findClaimable(ownerUserId, kind.name(), now, 25);
            for (BrowserTask candidate : candidates) {
                String candidateToken = UUID.randomUUID().toString();
                String candidateHash = BrowserTaskCommandService.tokenHash(candidateToken);
                Instant expiresAt = now.plus(leaseDuration);
                if (tasks.claim(
                                candidate.getTaskId(),
                                request.runtimeInstanceId(),
                                candidateHash,
                                expiresAt,
                                now)
                        == 1) {
                    task = tasks.findById(candidate.getTaskId()).orElse(candidate);
                    leaseToken = candidateToken;
                    break;
                }
            }
        }
        if (task == null) return null;
        if (leaseToken == null || leaseToken.isBlank()) {
            throw new IllegalArgumentException("续租浏览器任务需要 leaseToken");
        }
        String leaseHash = BrowserTaskCommandService.tokenHash(leaseToken);
        Instant leaseExpiresAt = now.plus(leaseDuration);
        int renewed =
                tasks.renew(
                        task.getTaskId(),
                        request.runtimeInstanceId(),
                        leaseHash,
                        leaseExpiresAt,
                        now);
        if (renewed != 1) {
            throw new IllegalArgumentException("浏览器任务租约已失效，请重新领取");
        }
        BrowserTaskCommand command =
                commands.claimFor(task, request.runtimeInstanceId(), leaseHash);
        if (command != null && !supports(request, task, command)) {
            commands.result(
                    ownerUserId,
                    command.getCommandId(),
                    request.runtimeInstanceId(),
                    leaseToken,
                    request.protocolVersion(),
                    false,
                    false,
                    "{}",
                    Map.of(),
                    "当前 Runtime 不支持动作或交互模式：" + command.getActionType());
            command = null;
        }
        return new LeaseView(
                task.getTaskId(),
                leaseToken,
                leaseExpiresAt,
                task.getProtocolVersion(),
                task.getCapability(),
                task.getInteractionMode(),
                task.getGoal(),
                task.getStartUrl(),
                task.getAllowedOrigins(),
                task.getBusinessContext(),
                task.getConstraints(),
                task.getSuccessCriteria(),
                task.getMaxSteps(),
                command == null
                        ? null
                        : new CommandView(
                                command.getCommandId(),
                                command.getSequenceNo(),
                                command.getActionType(),
                                command.getActionJson(),
                                command.getExpiresAt()));
    }

    public void report(String ownerUserId, String commandId, CommandResult request) {
        commands.result(
                ownerUserId,
                commandId,
                request.runtimeInstanceId(),
                request.leaseToken(),
                request.protocolVersion(),
                request.ok(),
                request.verified(),
                request.result(),
                request.observation(),
                request.error());
    }

    public void release(String ownerUserId, ReleaseRequest request) {
        BrowserTask task =
                tasks.findById(request.taskId())
                        .filter(value -> ownerUserId.equals(value.getOwnerUserId()))
                        .orElseThrow(() -> new NoSuchElementException("浏览器任务不存在"));
        if (!request.runtimeInstanceId().equals(task.getLeaseRuntimeInstanceId())
                || !BrowserTaskCommandService.tokenHash(request.leaseToken())
                        .equals(task.getLeaseTokenHash())) {
            throw new IllegalArgumentException("浏览器任务租约无效");
        }
        tasks.release(task.getTaskId(), request.runtimeInstanceId(), task.getLeaseTokenHash());
    }

    private boolean supports(ClaimRequest request, BrowserTask task, BrowserTaskCommand command) {
        boolean actionSupported =
                request.supportedActions() == null
                        || request.supportedActions().isEmpty()
                        || request.supportedActions()
                                .stream()
                                .anyMatch(value -> command.getActionType().equalsIgnoreCase(value));
        boolean modeSupported =
                request.interactionModes() == null
                        || request.interactionModes().isEmpty()
                        || request.interactionModes()
                                .stream()
                                .map(BrowserInteractionMode::from)
                                .anyMatch(value -> value == task.interactionMode());
        return actionSupported && modeSupported;
    }

    public record ClaimRequest(
            String runtimeKind,
            String runtimeInstanceId,
            int protocolVersion,
            String runtimeVersion,
            List<String> supportedActions,
            List<String> interactionModes,
            String currentUrl,
            String leaseToken) {}

    public record LeaseView(
            String taskId,
            String leaseToken,
            Instant leaseExpiresAt,
            int protocolVersion,
            String capability,
            String interactionMode,
            String goal,
            String startUrl,
            String allowedOrigins,
            String businessContext,
            String constraints,
            String successCriteria,
            int maxSteps,
            CommandView command) {}

    public record CommandView(
            String commandId,
            int sequenceNo,
            String actionType,
            String actionJson,
            Instant expiresAt) {}

    public record CommandResult(
            String runtimeInstanceId,
            String leaseToken,
            int protocolVersion,
            boolean ok,
            boolean verified,
            String result,
            Map<String, Object> observation,
            String error) {}

    public record ReleaseRequest(
            String taskId, String runtimeInstanceId, String leaseToken, String reason) {}
}
