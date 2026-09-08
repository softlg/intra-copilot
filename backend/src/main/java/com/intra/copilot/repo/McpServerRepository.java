package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.intra.copilot.model.McpServer;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface McpServerRepository extends BaseMapper<McpServer> {
    default McpServer save(McpServer value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<McpServer> findById(String id) { return Optional.ofNullable(selectById(id)); }
    default List<McpServer> findAll() { return selectList(null); }
}
