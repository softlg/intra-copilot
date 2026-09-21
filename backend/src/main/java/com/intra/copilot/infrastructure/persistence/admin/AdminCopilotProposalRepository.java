package com.intra.copilot.infrastructure.persistence.admin;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.admin.AdminCopilotProposal;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AdminCopilotProposalRepository extends BaseMapper<AdminCopilotProposal> {
    default AdminCopilotProposal save(AdminCopilotProposal value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<AdminCopilotProposal> findOwned(String id, String adminUserId) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<AdminCopilotProposal>query()
                                .eq("id", id)
                                .eq("admin_user_id", adminUserId)
                                .last("LIMIT 1")));
    }

    default List<AdminCopilotProposal> findBySession(String sessionId) {
        return selectList(
                Wrappers.<AdminCopilotProposal>query()
                        .eq("session_id", sessionId)
                        .orderByDesc("created_at"));
    }
}
