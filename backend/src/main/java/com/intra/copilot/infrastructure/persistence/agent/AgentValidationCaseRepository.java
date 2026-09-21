package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.AgentValidationCase;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentValidationCaseRepository extends BaseMapper<AgentValidationCase> {
    default void append(AgentValidationCase value) {
        insert(value);
    }

    default List<AgentValidationCase> findByRun(String runId) {
        return selectList(
                Wrappers.<AgentValidationCase>query().eq("run_id", runId).orderByAsc("case_index"));
    }
}
