package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface BrowserTaskRepository extends BaseMapper<BrowserTask> {
    default BrowserTask save(BrowserTask value) {
        if (selectById(value.getTaskId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<BrowserTask> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<BrowserTask> findByOwner(String ownerUserId, int limit) {
        return selectList(
                Wrappers.<BrowserTask>query()
                        .eq("owner_user_id", ownerUserId)
                        .orderByDesc("created_at")
                        .last("LIMIT " + Math.max(1, Math.min(200, limit))));
    }

    default Optional<BrowserTask> findByIdempotencyKey(String ownerUserId, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) return Optional.empty();
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<BrowserTask>query()
                                .eq("owner_user_id", ownerUserId)
                                .eq("idempotency_key", idempotencyKey)
                                .last("LIMIT 1")));
    }

    default Optional<BrowserTask> findLeasedByRuntime(String runtimeInstanceId) {
        if (runtimeInstanceId == null || runtimeInstanceId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<BrowserTask>query()
                                .eq("lease_runtime_instance_id", runtimeInstanceId)
                                .in(
                                        "status",
                                        BrowserTaskStatus.CREATED.name(),
                                        BrowserTaskStatus.QUEUED.name(),
                                        BrowserTaskStatus.RUNNING.name())
                                .gt("lease_expires_at", Instant.now())
                                .orderByDesc("updated_at")
                                .last("LIMIT 1")));
    }

    default List<BrowserTask> findClaimable(
            String ownerUserId, String runtimeKind, Instant now, int limit) {
        return selectList(
                Wrappers.<BrowserTask>query()
                        .eq("owner_user_id", ownerUserId)
                        .eq("runtime_kind", runtimeKind)
                        .in(
                                "status",
                                BrowserTaskStatus.CREATED.name(),
                                BrowserTaskStatus.QUEUED.name(),
                                BrowserTaskStatus.RUNNING.name())
                        .and(
                                wrapper ->
                                        wrapper.isNull("lease_expires_at")
                                                .or()
                                                .le("lease_expires_at", now))
                        .and(wrapper -> wrapper.isNull("expires_at").or().gt("expires_at", now))
                        .orderByAsc("created_at")
                        .last("LIMIT " + Math.max(1, Math.min(50, limit))));
    }

    default int claim(
            String taskId,
            String runtimeInstanceId,
            String leaseTokenHash,
            Instant leaseExpiresAt,
            Instant now) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .and(
                                wrapper ->
                                        wrapper.isNull("lease_expires_at")
                                                .or()
                                                .le("lease_expires_at", now))
                        .set("lease_runtime_instance_id", runtimeInstanceId)
                        .set("lease_token_hash", leaseTokenHash)
                        .set("lease_expires_at", leaseExpiresAt)
                        .set("updated_at", now));
    }

    default int renew(
            String taskId,
            String runtimeInstanceId,
            String leaseTokenHash,
            Instant leaseExpiresAt,
            Instant now) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .eq("lease_runtime_instance_id", runtimeInstanceId)
                        .eq("lease_token_hash", leaseTokenHash)
                        .gt("lease_expires_at", now)
                        .set("lease_expires_at", leaseExpiresAt)
                        .set("updated_at", now));
    }

    default int release(String taskId, String runtimeInstanceId, String leaseTokenHash) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .eq("lease_runtime_instance_id", runtimeInstanceId)
                        .eq("lease_token_hash", leaseTokenHash)
                        .setSql("lease_runtime_instance_id = NULL")
                        .setSql("lease_token_hash = NULL")
                        .setSql("lease_expires_at = NULL")
                        .set("updated_at", Instant.now()));
    }

    default List<BrowserTask> findExpired(Instant now, int limit) {
        return selectList(
                Wrappers.<BrowserTask>query()
                        .in(
                                "status",
                                BrowserTaskStatus.CREATED.name(),
                                BrowserTaskStatus.QUEUED.name(),
                                BrowserTaskStatus.RUNNING.name())
                        .isNotNull("expires_at")
                        .lt("expires_at", now)
                        .orderByAsc("expires_at")
                        .last("LIMIT " + Math.max(1, Math.min(500, limit))));
    }

    default int markQueued(String taskId, String executionToken, Instant now) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .eq("status", BrowserTaskStatus.CREATED.name())
                        .set("status", BrowserTaskStatus.QUEUED.name())
                        .set("execution_token", executionToken)
                        .set("worker_heartbeat_at", now)
                        .set("updated_at", now)
                        .setSql("execution_attempts = execution_attempts + 1"));
    }

    default int heartbeat(String taskId, String executionToken, Instant now) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .eq("execution_token", executionToken)
                        .in(
                                "status",
                                BrowserTaskStatus.QUEUED.name(),
                                BrowserTaskStatus.RUNNING.name())
                        .set("worker_heartbeat_at", now)
                        .set("updated_at", now));
    }

    default int startExecution(String taskId, String executionToken, Instant now) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .eq("status", BrowserTaskStatus.QUEUED.name())
                        .eq("execution_token", executionToken)
                        .set("status", BrowserTaskStatus.RUNNING.name())
                        .set("started_at", now)
                        .set("worker_heartbeat_at", now)
                        .set("updated_at", now));
    }

    default int clearExecution(String taskId) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .setSql("execution_token = NULL")
                        .setSql("worker_heartbeat_at = NULL"));
    }

    default List<BrowserTask> findRecoverable(
            Instant createdBefore, Instant heartbeatBefore, Instant runningBefore, int limit) {
        return selectList(
                Wrappers.<BrowserTask>query()
                        .and(
                                wrapper ->
                                        wrapper.and(
                                                        created ->
                                                                created.eq(
                                                                                "status",
                                                                                BrowserTaskStatus
                                                                                        .CREATED
                                                                                        .name())
                                                                        .lt(
                                                                                "created_at",
                                                                                createdBefore))
                                                .or(
                                                        queued ->
                                                                queued.eq(
                                                                                "status",
                                                                                BrowserTaskStatus
                                                                                        .QUEUED
                                                                                        .name())
                                                                        .and(
                                                                                heartbeat ->
                                                                                        heartbeat
                                                                                                .isNull(
                                                                                                        "worker_heartbeat_at")
                                                                                                .or()
                                                                                                .lt(
                                                                                                        "worker_heartbeat_at",
                                                                                                        heartbeatBefore)))
                                                .or(
                                                        running ->
                                                                running.eq(
                                                                                "status",
                                                                                BrowserTaskStatus
                                                                                        .RUNNING
                                                                                        .name())
                                                                        .and(
                                                                                heartbeat ->
                                                                                        heartbeat
                                                                                                .isNull(
                                                                                                        "worker_heartbeat_at")
                                                                                                .or()
                                                                                                .lt(
                                                                                                        "worker_heartbeat_at",
                                                                                                        runningBefore))))
                        .orderByAsc("updated_at")
                        .last("LIMIT " + Math.max(1, Math.min(200, limit))));
    }

    default int requeue(String taskId, String expectedStatus, Instant now) {
        return update(
                null,
                Wrappers.<BrowserTask>update()
                        .eq("task_id", taskId)
                        .eq("status", expectedStatus)
                        .set("status", BrowserTaskStatus.CREATED.name())
                        .setSql("execution_token = NULL")
                        .setSql("worker_heartbeat_at = NULL")
                        .set("updated_at", now));
    }
}
