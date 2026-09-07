package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.intra.copilot.model.ToolDefinition;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ToolDefinitionRepository extends BaseMapper<ToolDefinition> {
    default ToolDefinition save(ToolDefinition value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<ToolDefinition> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<ToolDefinition> findAll() {
        return selectList(null);
    }
}
