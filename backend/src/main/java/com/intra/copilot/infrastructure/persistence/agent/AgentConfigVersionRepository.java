package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.AgentConfigVersion;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentConfigVersionRepository extends BaseMapper<AgentConfigVersion> {
    default AgentConfigVersion save(AgentConfigVersion value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default List<AgentConfigVersion> findByAgentId(String agentId) {
        return selectList(
                Wrappers.<AgentConfigVersion>query()
                        .eq("agent_id", agentId)
                        .orderByDesc("version"));
    }

    default Optional<AgentConfigVersion> findByAgentIdAndVersion(String agentId, long version) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<AgentConfigVersion>query()
                                .eq("agent_id", agentId)
                                .eq("version", version)));
    }
}
