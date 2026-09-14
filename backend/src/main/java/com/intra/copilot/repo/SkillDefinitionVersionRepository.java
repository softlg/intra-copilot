package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.SkillDefinitionVersion;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkillDefinitionVersionRepository extends BaseMapper<SkillDefinitionVersion> {
    default SkillDefinitionVersion save(SkillDefinitionVersion value) {
        insert(value);
        return value;
    }

    default List<SkillDefinitionVersion> findBySkillId(String skillId) {
        return selectList(
                Wrappers.<SkillDefinitionVersion>query()
                        .eq("skill_id", skillId)
                        .orderByDesc("version"));
    }

    default Optional<SkillDefinitionVersion> findBySkillIdAndVersion(String skillId, long version) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<SkillDefinitionVersion>query()
                                .eq("skill_id", skillId)
                                .eq("version", version)
                                .last("LIMIT 1")));
    }

    default long countBySkillId(String skillId) {
        return selectCount(Wrappers.<SkillDefinitionVersion>query().eq("skill_id", skillId));
    }
}
