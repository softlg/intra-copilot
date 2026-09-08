package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentChildBinding;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentChildBindingRepository extends BaseMapper<AgentChildBinding> {
    default List<AgentChildBinding> findByParent(String parentId) {
        return selectList(Wrappers.<AgentChildBinding>query().eq("parent_agent_id", parentId)
                .orderByAsc("priority").orderByAsc("created_at"));
    }
    default List<AgentChildBinding> findByChild(String childId) {
        return selectList(Wrappers.<AgentChildBinding>query().eq("child_agent_id", childId));
    }
    default void deleteByParent(String parentId) { delete(Wrappers.<AgentChildBinding>query().eq("parent_agent_id", parentId)); }
}
