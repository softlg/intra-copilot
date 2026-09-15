package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentPlan;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentPlanRepository extends BaseMapper<AgentPlan> {
    default AgentPlan save(AgentPlan value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<AgentPlan> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<AgentPlan> findByConversationIdOrderByCreatedAtAsc(String conversationId) {
        return selectList(
                Wrappers.<AgentPlan>query()
                        .eq("conversation_id", conversationId)
                        .orderByAsc("created_at")
                        .orderByAsc("revision"));
    }

    default List<AgentPlan> findByInvocationIdOrderByRevisionAsc(String invocationId) {
        return selectList(
                Wrappers.<AgentPlan>query()
                        .eq("invocation_id", invocationId)
                        .orderByAsc("revision"));
    }
}
