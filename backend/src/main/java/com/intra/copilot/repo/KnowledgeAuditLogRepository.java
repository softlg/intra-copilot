package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.KnowledgeAuditLog;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface KnowledgeAuditLogRepository extends BaseMapper<KnowledgeAuditLog> {

    default void record(KnowledgeAuditLog entry) {
        insert(entry);
    }

    default List<KnowledgeAuditLog> findRecentByKnowledgeBaseId(String baseId, int limit) {
        return selectList(
                Wrappers.<KnowledgeAuditLog>query()
                        .eq("knowledge_base_id", baseId)
                        .orderByDesc("created_at")
                        .last("LIMIT " + Math.max(1, limit)));
    }
}
