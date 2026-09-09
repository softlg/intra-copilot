package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.KnowledgeDocumentStorage;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeDocumentStorageRepository extends BaseMapper<KnowledgeDocumentStorage> {

    default KnowledgeDocumentStorage save(KnowledgeDocumentStorage value) {
        if (selectById(value.getDocumentId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<KnowledgeDocumentStorage> findByDocumentId(String documentId) {
        return Optional.ofNullable(selectById(documentId));
    }
}
