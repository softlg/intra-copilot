package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.AgentChildBinding;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentChildBindingRepository extends BaseMapper<AgentChildBinding> {
    default List<AgentChildBinding> findAll() {
        return selectList(null);
    }

    default List<AgentChildBinding> findByParent(String parentId) {
        return selectList(
                Wrappers.<AgentChildBinding>query()
                        .eq("parent_agent_id", parentId)
                        .orderByAsc("priority")
                        .orderByAsc("created_at"));
    }

    default List<AgentChildBinding> findByChild(String childId) {
        return selectList(Wrappers.<AgentChildBinding>query().eq("child_agent_id", childId));
    }

    default Optional<AgentChildBinding> findOneByChild(String childId) {
        return findByChild(childId).stream().findFirst();
    }

    default void deleteByParent(String parentId) {
        delete(Wrappers.<AgentChildBinding>query().eq("parent_agent_id", parentId));
    }

    default void deleteByChild(String childId) {
        delete(Wrappers.<AgentChildBinding>query().eq("child_agent_id", childId));
    }
}
