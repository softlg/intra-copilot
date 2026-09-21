package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.BrowserRuntimeInstance;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface BrowserRuntimeInstanceRepository extends BaseMapper<BrowserRuntimeInstance> {
    default BrowserRuntimeInstance save(BrowserRuntimeInstance value) {
        if (selectById(value.getInstanceId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<BrowserRuntimeInstance> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default boolean online(String runtimeKind, int protocolVersion, Instant threshold) {
        return selectCount(
                        Wrappers.<BrowserRuntimeInstance>query()
                                .eq("runtime_kind", runtimeKind)
                                .eq("protocol_version", protocolVersion)
                                .ge("last_seen_at", threshold))
                > 0;
    }

    default List<BrowserRuntimeInstance> findOnline(
            String runtimeKind, int protocolVersion, Instant threshold, int limit) {
        return selectList(
                Wrappers.<BrowserRuntimeInstance>query()
                        .eq("runtime_kind", runtimeKind)
                        .eq("protocol_version", protocolVersion)
                        .ge("last_seen_at", threshold)
                        .orderByDesc("last_seen_at")
                        .last("LIMIT " + Math.max(1, Math.min(200, limit))));
    }

    default int deleteStale(Instant threshold) {
        return delete(Wrappers.<BrowserRuntimeInstance>query().lt("last_seen_at", threshold));
    }
}
