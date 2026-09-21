package com.intra.copilot.infrastructure.persistence.capability;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.capability.SkillDefinition;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkillDefinitionRepository extends BaseMapper<SkillDefinition> {
    default SkillDefinition save(SkillDefinition value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<SkillDefinition> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<SkillDefinition> findAll() {
        return selectList(null);
    }

    default boolean updateIfLockVersionMatches(SkillDefinition value, long expectedVersion) {
        return update(
                        value,
                        Wrappers.<SkillDefinition>update()
                                .eq("id", value.getId())
                                .eq("lock_version", expectedVersion))
                > 0;
    }

    default void incrementUsage(String id, Instant usedAt) {
        update(
                null,
                Wrappers.<SkillDefinition>update()
                        .eq("id", id)
                        .setSql("invocation_count = invocation_count + 1")
                        .set("last_used_at", usedAt));
    }
}
