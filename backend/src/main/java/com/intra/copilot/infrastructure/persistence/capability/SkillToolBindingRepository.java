package com.intra.copilot.infrastructure.persistence.capability;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.capability.SkillToolBinding;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkillToolBindingRepository extends BaseMapper<SkillToolBinding> {
    default List<SkillToolBinding> findBySkillId(String skillId) {
        return selectList(
                Wrappers.<SkillToolBinding>query()
                        .eq("skill_id", skillId)
                        .orderByAsc("created_at"));
    }

    default List<SkillToolBinding> findBySkillIds(Collection<String> skillIds) {
        if (skillIds == null || skillIds.isEmpty()) return List.of();
        return selectList(Wrappers.<SkillToolBinding>query().in("skill_id", skillIds));
    }

    default List<SkillToolBinding> findByToolId(String toolId) {
        return selectList(Wrappers.<SkillToolBinding>query().eq("tool_id", toolId));
    }

    default void replace(String skillId, List<String> toolIds) {
        delete(Wrappers.<SkillToolBinding>query().eq("skill_id", skillId));
        if (toolIds == null) return;
        for (String toolId : toolIds) {
            SkillToolBinding binding = new SkillToolBinding();
            binding.setSkillId(skillId);
            binding.setToolId(toolId);
            insert(binding);
        }
    }

    default long countBySkillId(String skillId) {
        return selectCount(Wrappers.<SkillToolBinding>query().eq("skill_id", skillId));
    }

    default void deleteByToolId(String toolId) {
        delete(Wrappers.<SkillToolBinding>query().eq("tool_id", toolId));
    }
}
