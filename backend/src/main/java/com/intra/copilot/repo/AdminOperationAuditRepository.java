package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AdminOperationAudit;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AdminOperationAuditRepository extends BaseMapper<AdminOperationAudit> {
    default void append(AdminOperationAudit value) {
        insert(value);
    }

    default List<AdminOperationAudit> recent(int limit) {
        return selectList(
                Wrappers.<AdminOperationAudit>query()
                        .orderByDesc("created_at")
                        .last("LIMIT " + Math.max(1, Math.min(200, limit))));
    }
}
