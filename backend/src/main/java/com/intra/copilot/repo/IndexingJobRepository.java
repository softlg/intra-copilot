package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.IndexingJob;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface IndexingJobRepository extends BaseMapper<IndexingJob> {

    default IndexingJob save(IndexingJob value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<IndexingJob> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<IndexingJob> findRecentByKnowledgeBaseId(String baseId, int limit) {
        return selectList(
                Wrappers.<IndexingJob>query()
                        .eq("knowledge_base_id", baseId)
                        .orderByDesc("created_at")
                        .last("LIMIT " + Math.max(1, limit)));
    }

    default List<IndexingJob> findChildren(String parentId) {
        return selectList(Wrappers.<IndexingJob>query().eq("parent_id", parentId));
    }

    default List<IndexingJob> findActiveByDocumentId(String documentId) {
        return selectList(
                Wrappers.<IndexingJob>query()
                        .eq("document_id", documentId)
                        .in("status", IndexingJob.STATUS_QUEUED, IndexingJob.STATUS_RUNNING, IndexingJob.STATUS_WAITING));
    }

    default List<IndexingJob> findActiveByKnowledgeBaseId(String baseId) {
        return selectList(
                Wrappers.<IndexingJob>query()
                        .eq("knowledge_base_id", baseId)
                        .in("status", IndexingJob.STATUS_QUEUED, IndexingJob.STATUS_RUNNING, IndexingJob.STATUS_WAITING));
    }
}
