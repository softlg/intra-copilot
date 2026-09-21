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
                                BrowserTaskStatus.RUNNING.name())
                        .isNotNull("expires_at")
                        .lt("expires_at", now)
                        .orderByAsc("expires_at")
                        .last("LIMIT " + Math.max(1, Math.min(500, limit))));
    }
}
