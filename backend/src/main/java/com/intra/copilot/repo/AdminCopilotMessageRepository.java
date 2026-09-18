package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AdminCopilotMessage;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AdminCopilotMessageRepository extends BaseMapper<AdminCopilotMessage> {
    default void append(AdminCopilotMessage value) {
        insert(value);
    }

    default List<AdminCopilotMessage> findBySession(String sessionId) {
        return selectList(
                Wrappers.<AdminCopilotMessage>query()
                        .eq("session_id", sessionId)
                        .orderByAsc("created_at"));
    }

    default Optional<AdminCopilotMessage> findLastBySession(String sessionId) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<AdminCopilotMessage>query()
                                .eq("session_id", sessionId)
                                .orderByDesc("created_at")
                                .last("LIMIT 1")));
    }
}
