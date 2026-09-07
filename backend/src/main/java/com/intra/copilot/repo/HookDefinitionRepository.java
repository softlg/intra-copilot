package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.intra.copilot.model.HookDefinition;
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
}
