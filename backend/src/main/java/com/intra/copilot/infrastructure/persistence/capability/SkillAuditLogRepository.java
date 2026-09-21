package com.intra.copilot.infrastructure.persistence.capability;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.capability.SkillAuditLog;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkillAuditLogRepository extends BaseMapper<SkillAuditLog> {
    default SkillAuditLog append(SkillAuditLog value) {
        insert(value);
        return value;
    }

    default List<SkillAuditLog> findBySkillId(String skillId) {
        return selectList(
                Wrappers.<SkillAuditLog>query().eq("skill_id", skillId).orderByDesc("created_at"));
    }

    default void deleteBySkillId(String skillId) {
        delete(Wrappers.<SkillAuditLog>query().eq("skill_id", skillId));
    }
}
