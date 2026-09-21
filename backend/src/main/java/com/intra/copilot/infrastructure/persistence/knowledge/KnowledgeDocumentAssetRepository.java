package com.intra.copilot.infrastructure.persistence.knowledge;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.knowledge.KnowledgeDocumentAsset;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeDocumentAssetRepository extends BaseMapper<KnowledgeDocumentAsset> {
    default KnowledgeDocumentAsset save(KnowledgeDocumentAsset value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default List<KnowledgeDocumentAsset> findAllByDocumentId(String documentId) {
        return selectList(
                Wrappers.<KnowledgeDocumentAsset>query()
                        .eq("document_id", documentId)
                        .orderByAsc("page_number")
                        .orderByAsc("created_at"));
    }

    default void deleteAllByDocumentId(String documentId) {
        delete(Wrappers.<KnowledgeDocumentAsset>query().eq("document_id", documentId));
    }

    default List<KnowledgeDocumentAsset> findAllByJobId(String jobId) {
        return selectList(Wrappers.<KnowledgeDocumentAsset>query().eq("job_id", jobId));
    }

    default void deleteAllByDocumentIdExceptJob(String documentId, String jobId) {
        delete(
                Wrappers.<KnowledgeDocumentAsset>query()
                        .eq("document_id", documentId)
                        .ne("job_id", jobId));
    }
}
