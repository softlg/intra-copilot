package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AdminCopilotSession;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AdminCopilotSessionRepository extends BaseMapper<AdminCopilotSession> {
    default AdminCopilotSession save(AdminCopilotSession value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<AdminCopilotSession> findOwned(String id, String adminUserId) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<AdminCopilotSession>query()
                                .eq("id", id)
                                .eq("admin_user_id", adminUserId)
                                .last("LIMIT 1")));
    }

    default List<AdminCopilotSession> findByOwner(String adminUserId) {
        return selectList(
                Wrappers.<AdminCopilotSession>query()
                        .eq("admin_user_id", adminUserId)
                        .orderByDesc("pinned")
                        .orderByDesc("updated_at"));
    }
}
