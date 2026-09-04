package com.intra.copilot.repo;

import com.intra.copilot.model.AgentDefinition;
import java.util.List;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentDefinitionRepository extends BaseMapper<AgentDefinition> {
  default AgentDefinition save(AgentDefinition value) { if (selectById(value.getId()) == null) insert(value); else updateById(value); return value; }
  default Optional<AgentDefinition> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default boolean existsById(String id) { return selectById(id) != null; }
  default List<AgentDefinition> findAll() { return selectList(null); }
  default List<AgentDefinition> findAllByEnabledTrueOrderByPriorityAscDisplayNameAsc() { return selectList(Wrappers.<AgentDefinition>query().eq("enabled", true).orderByAsc("priority").orderByAsc("display_name")); }
  default void delete(AgentDefinition value) { deleteById(value.getId()); }
}
