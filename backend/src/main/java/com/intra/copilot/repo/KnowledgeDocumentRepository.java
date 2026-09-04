package com.intra.copilot.repo;

import com.intra.copilot.model.KnowledgeDocument;
import java.util.List;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeDocumentRepository extends BaseMapper<KnowledgeDocument> {
  default KnowledgeDocument save(KnowledgeDocument value) { if (selectById(value.getId()) == null) insert(value); else updateById(value); return value; }
  default Optional<KnowledgeDocument> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default List<KnowledgeDocument> findAllByKnowledgeBaseIdOrderByCreatedAtDesc(String knowledgeBaseId) { return selectList(Wrappers.<KnowledgeDocument>query().eq("knowledge_base_id", knowledgeBaseId).orderByDesc("created_at")); }
}
