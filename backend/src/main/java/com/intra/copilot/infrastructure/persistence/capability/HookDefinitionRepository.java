package com.intra.copilot.infrastructure.persistence.capability;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.capability.HookDefinition;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface HookDefinitionRepository extends BaseMapper<HookDefinition> {
    default HookDefinition save(HookDefinition value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<HookDefinition> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<HookDefinition> findAll() {
        return selectList(null);
    }

    default boolean updateIfVersionMatches(HookDefinition value, long expectedVersion) {
        return update(
                        value,
                        Wrappers.<HookDefinition>update()
                                .eq("id", value.getId())
                                .eq("version", expectedVersion))
                > 0;
    }
}
