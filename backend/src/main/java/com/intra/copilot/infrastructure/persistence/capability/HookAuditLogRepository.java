package com.intra.copilot.infrastructure.persistence.capability;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.capability.HookAuditLog;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface HookAuditLogRepository extends BaseMapper<HookAuditLog> {
    default HookAuditLog append(HookAuditLog value) {
        insert(value);
        return value;
    }

    default List<HookAuditLog> findByHookId(String hookId) {
        return selectList(
                Wrappers.<HookAuditLog>query().eq("hook_id", hookId).orderByDesc("created_at"));
    }
}
