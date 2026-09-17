package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentInvocation;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentInvocationRepository extends BaseMapper<AgentInvocation> {
    default AgentInvocation save(AgentInvocation value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<AgentInvocation> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<AgentInvocation> findByConversationIdOrderByCreatedAtAsc(String conversationId) {
        return selectList(
                Wrappers.<AgentInvocation>query()
                        .eq("conversation_id", conversationId)
                        .orderByAsc("created_at"));
    }

    default List<AgentInvocation> findByTraceIdOrderBySequenceAsc(String traceId) {
        return selectList(
                Wrappers.<AgentInvocation>query()
                        .eq("trace_id", traceId)
                        .orderByAsc("sequence")
                        .orderByAsc("created_at"));
    }

    default AgentInvocation findLatestByConversationId(String conversationId) {
        return selectList(
                        Wrappers.<AgentInvocation>query()
                                .eq("conversation_id", conversationId)
                                .orderByDesc("created_at")
                                .last("LIMIT 1"))
                .stream()
                .findFirst()
                .orElse(null);
    }
}
