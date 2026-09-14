package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentSkillBinding;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentSkillBindingRepository extends BaseMapper<AgentSkillBinding> {
    default List<AgentSkillBinding> findByAgentId(String agentId) {
        return selectList(
                Wrappers.<AgentSkillBinding>query()
                        .eq("agent_id", agentId)
                        .orderByAsc("priority")
                        .orderByAsc("created_at"));
    }

    default List<AgentSkillBinding> findBySkillId(String skillId) {
        return selectList(
                Wrappers.<AgentSkillBinding>query().eq("skill_id", skillId).orderByAsc("agent_id"));
    }

    default List<AgentSkillBinding> findBySkillIds(Collection<String> skillIds) {
        if (skillIds == null || skillIds.isEmpty()) return List.of();
        return selectList(Wrappers.<AgentSkillBinding>query().in("skill_id", skillIds));
    }

    default void replace(String agentId, List<String> skillIds) {
        delete(Wrappers.<AgentSkillBinding>query().eq("agent_id", agentId));
        if (skillIds == null) return;
        int priority = 0;
        for (String skillId : skillIds) {
            AgentSkillBinding binding = new AgentSkillBinding();
            binding.setAgentId(agentId);
            binding.setSkillId(skillId);
            binding.setPriority(priority);
            binding.setEnabled(true);
            insert(binding);
            priority += 10;
        }
    }

    default void detachSkill(String skillId) {
        delete(Wrappers.<AgentSkillBinding>query().eq("skill_id", skillId));
    }

    default long countBySkillId(String skillId) {
        return selectCount(Wrappers.<AgentSkillBinding>query().eq("skill_id", skillId));
    }
}
