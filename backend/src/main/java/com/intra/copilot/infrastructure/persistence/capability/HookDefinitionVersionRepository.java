package com.intra.copilot.infrastructure.persistence.capability;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.capability.HookDefinitionVersion;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface HookDefinitionVersionRepository extends BaseMapper<HookDefinitionVersion> {
    default HookDefinitionVersion save(HookDefinitionVersion value) {
        insert(value);
        return value;
    }

    default List<HookDefinitionVersion> findByHookId(String hookId) {
        return selectList(
                Wrappers.<HookDefinitionVersion>query()
                        .eq("hook_id", hookId)
                        .orderByDesc("version"));
    }

    default Optional<HookDefinitionVersion> findByHookIdAndVersion(String hookId, long version) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<HookDefinitionVersion>query()
                                .eq("hook_id", hookId)
                                .eq("version", version)
                                .last("LIMIT 1")));
    }
}
