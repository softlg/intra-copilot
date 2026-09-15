package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentPlanStep;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentPlanStepRepository extends BaseMapper<AgentPlanStep> {
    default AgentPlanStep save(AgentPlanStep value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default List<AgentPlanStep> findByPlanIdOrderByStepIndexAsc(String planId) {
        return selectList(
                Wrappers.<AgentPlanStep>query().eq("plan_id", planId).orderByAsc("step_index"));
    }
}
