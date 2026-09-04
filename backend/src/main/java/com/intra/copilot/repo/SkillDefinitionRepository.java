package com.intra.copilot.repo;

import com.intra.copilot.model.SkillDefinition;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Optional;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkillDefinitionRepository extends BaseMapper<SkillDefinition> {
  default SkillDefinition save(SkillDefinition value) { if (selectById(value.getId()) == null) insert(value); else updateById(value); return value; }
  default Optional<SkillDefinition> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default List<SkillDefinition> findAll() { return selectList(null); }
}
