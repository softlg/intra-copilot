package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.BrowserTaskCommand;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface BrowserTaskCommandRepository extends BaseMapper<BrowserTaskCommand> {
    default BrowserTaskCommand save(BrowserTaskCommand value) {
        if (selectById(value.getCommandId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<BrowserTaskCommand> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default int nextSequence(String taskId) {
        BrowserTaskCommand last =
                selectOne(
                        Wrappers.<BrowserTaskCommand>query()
                                .eq("task_id", taskId)
                                .orderByDesc("sequence_no")
                                .last("LIMIT 1"));
        return last == null ? 1 : last.getSequenceNo() + 1;
    }

    default Optional<BrowserTaskCommand> nextPending(String taskId) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<BrowserTaskCommand>query()
                                .eq("task_id", taskId)
                                .eq("status", BrowserTaskCommand.PENDING)
                                .orderByAsc("sequence_no")
                                .last("LIMIT 1")));
    }

    default List<BrowserTaskCommand> findForTask(String taskId) {
        return selectList(
                Wrappers.<BrowserTaskCommand>query()
                        .eq("task_id", taskId)
                        .orderByAsc("sequence_no"));
    }

    default int transition(
            String commandId,
            String expectedStatus,
            String nextStatus,
            String runtimeInstanceId,
            String leaseTokenHash,
            Instant now,
            Instant expiresAt) {
        return update(
                null,
                Wrappers.<BrowserTaskCommand>update()
                        .eq("command_id", commandId)
                        .eq("status", expectedStatus)
                        .set("status", nextStatus)
                        .set("runtime_instance_id", runtimeInstanceId)
                        .set("lease_token_hash", leaseTokenHash)
                        .set("updated_at", now)
                        .set("expires_at", expiresAt)
                        .setSql("attempt_count = attempt_count + 1"));
    }

    default List<BrowserTaskCommand> findExpiredActive(Instant now, int limit) {
        return selectList(
                Wrappers.<BrowserTaskCommand>query()
                        .in("status", BrowserTaskCommand.PENDING, BrowserTaskCommand.RUNNING)
                        .lt("expires_at", now)
                        .orderByAsc("expires_at")
                        .last("LIMIT " + Math.max(1, Math.min(500, limit))));
    }

    default List<BrowserTaskCommand> findActiveForTask(String taskId) {
        return selectList(
                Wrappers.<BrowserTaskCommand>query()
                        .eq("task_id", taskId)
                        .in("status", BrowserTaskCommand.PENDING, BrowserTaskCommand.RUNNING)
                        .orderByAsc("sequence_no"));
    }
}
