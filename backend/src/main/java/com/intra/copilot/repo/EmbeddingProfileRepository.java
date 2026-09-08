package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.EmbeddingProfile;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface EmbeddingProfileRepository extends BaseMapper<EmbeddingProfile> {
    default EmbeddingProfile save(EmbeddingProfile value) {
        if (selectById(value.getId()) == null) insert(value); else updateById(value);
        return value;
    }
    default Optional<EmbeddingProfile> findById(String id) { return Optional.ofNullable(selectById(id)); }
    default List<EmbeddingProfile> findAll() { return selectList(Wrappers.<EmbeddingProfile>query().orderByAsc("name")); }
    default Optional<EmbeddingProfile> findDefault() {
        return Optional.ofNullable(selectOne(Wrappers.<EmbeddingProfile>query().eq("default_profile", true).last("LIMIT 1")));
    }
}
