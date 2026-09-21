package com.intra.copilot.infrastructure.persistence.conversation;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.conversation.AgentInvocationEvent;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AgentInvocationEventRepository extends BaseMapper<AgentInvocationEvent> {
    default AgentInvocationEvent save(AgentInvocationEvent value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<AgentInvocationEvent> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<AgentInvocationEvent> findByInvocationIdOrderBySequenceAsc(String invocationId) {
        return selectList(
                Wrappers.<AgentInvocationEvent>query()
                        .eq("invocation_id", invocationId)
                        .orderByAsc("sequence"));
    }

    default List<AgentInvocationEvent> findByCorrelationIdOrderByCreatedAtAsc(
            String correlationId) {
        return selectList(
                Wrappers.<AgentInvocationEvent>query()
                        .eq("correlation_id", correlationId)
                        .orderByAsc("created_at"));
    }

    default List<AgentInvocationEvent> findByTraceIdOrderBySequenceGlobalAsc(String traceId) {
        return selectList(
                Wrappers.<AgentInvocationEvent>query()
                        .eq("trace_id", traceId)
                        .orderByAsc("sequence_global")
                        .orderByAsc("created_at"));
    }

    @Select("SELECT nextval('agent_invocation_event_global_seq')")
    long nextGlobalSequence();

    default int deleteOlderThan(Instant cutoff) {
        return delete(Wrappers.<AgentInvocationEvent>query().lt("created_at", cutoff));
    }

    default int nextSequence(String invocationId) {
        Integer max =
                selectList(
                                Wrappers.<AgentInvocationEvent>query()
                                        .eq("invocation_id", invocationId)
                                        .orderByDesc("sequence")
                                        .last("LIMIT 1"))
                        .stream()
                        .findFirst()
                        .map(AgentInvocationEvent::getSequence)
                        .orElse(0);
        return max + 1;
    }

    default long countHookChecks(String hookId, String status) {
        return selectCount(
                Wrappers.<AgentInvocationEvent>query()
                        .eq("event_type", "HOOK_CHECK")
                        .eq("status", status)
                        .apply("payload ->> 'hookId' = {0}", hookId));
    }

    default AgentInvocationEvent latestHookCheck(String hookId) {
        return selectList(
                        Wrappers.<AgentInvocationEvent>query()
                                .eq("event_type", "HOOK_CHECK")
                                .apply("payload ->> 'hookId' = {0}", hookId)
                                .orderByDesc("created_at")
                                .last("LIMIT 1"))
                .stream()
                .findFirst()
                .orElse(null);
    }
}
