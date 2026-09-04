package com.intra.copilot.repo;

import com.intra.copilot.model.KnowledgeBase;
import java.util.List;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeBaseRepository extends BaseMapper<KnowledgeBase> {
  default KnowledgeBase save(KnowledgeBase value) { if (selectById(value.getId()) == null) insert(value); else updateById(value); return value; }
  default Optional<KnowledgeBase> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default List<KnowledgeBase> findAll() { return selectList(null); }
  default List<KnowledgeBase> findAllByOrderByUpdatedAtDesc() { return selectList(Wrappers.<KnowledgeBase>query().orderByDesc("updated_at")); }
}
