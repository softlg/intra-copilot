package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentConfigVersion;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentConfigVersionRepository extends BaseMapper<AgentConfigVersion> {
    default AgentConfigVersion save(AgentConfigVersion value) {
        if (selectById(value.getId()) == null) insert(value); else updateById(value);
        return value;
    }
    default List<AgentConfigVersion> findByAgentId(String agentId) {
        return selectList(Wrappers.<AgentConfigVersion>query().eq("agent_id", agentId).orderByDesc("version"));
    }
}
