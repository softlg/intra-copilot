package com.intra.copilot.infrastructure.persistence.admin;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.admin.AdminCopilotMessage;
import java.util.List;
import java.util.Collection;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

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

    default List<AdminCopilotMessage> findRecentBySession(String sessionId, int limit) {
        int safeLimit = Math.max(1, Math.min(500, limit));
        List<AdminCopilotMessage> descending =
                selectList(
                        Wrappers.<AdminCopilotMessage>query()
                                .eq("session_id", sessionId)
                                .orderByDesc("created_at")
                                .last("LIMIT " + safeLimit));
        List<AdminCopilotMessage> ascending = new java.util.ArrayList<>(descending);
        java.util.Collections.reverse(ascending);
        return ascending;
    }

    @Select(
            """
            <script>
            SELECT DISTINCT ON (session_id) *
            FROM admin_copilot_message
            WHERE session_id IN
            <foreach collection="sessionIds" item="id" open="(" separator="," close=")">
              #{id}
            </foreach>
            ORDER BY session_id, created_at DESC
            </script>
            """)
    List<AdminCopilotMessage> findLatestBySessionIds(
            @Param("sessionIds") Collection<String> sessionIds);

    default Optional<AdminCopilotMessage> findLastBySession(String sessionId) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<AdminCopilotMessage>query()
                                .eq("session_id", sessionId)
                                .orderByDesc("created_at")
                                .last("LIMIT 1")));
    }
}
