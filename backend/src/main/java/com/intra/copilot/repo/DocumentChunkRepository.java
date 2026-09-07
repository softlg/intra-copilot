package com.intra.copilot.repo;
import com.intra.copilot.model.DocumentChunk;
import java.util.List;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
@Mapper
public interface DocumentChunkRepository extends BaseMapper<DocumentChunk> {
  default DocumentChunk save(DocumentChunk value) { if (selectById(value.getId()) == null) insert(value); else updateById(value); return value; }
  default Optional<DocumentChunk> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default void deleteAllByDocumentId(String id) { delete(Wrappers.<DocumentChunk>query().eq("document_id", id)); }
  default List<DocumentChunk> findAllByDocumentIdOrderByChunkIndex(String id) { return selectList(Wrappers.<DocumentChunk>query().eq("document_id", id).orderByAsc("chunk_index")); }
}
