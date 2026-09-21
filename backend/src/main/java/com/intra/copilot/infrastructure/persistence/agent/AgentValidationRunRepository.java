package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.AgentValidationRun;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentValidationRunRepository extends BaseMapper<AgentValidationRun> {
    default AgentValidationRun save(AgentValidationRun value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default List<AgentValidationRun> findByAgent(String agentId, int limit) {
        return selectList(
                Wrappers.<AgentValidationRun>query()
                        .eq("agent_id", agentId)
                        .orderByDesc("created_at")
                        .last("LIMIT " + Math.max(1, Math.min(50, limit))));
    }
}
