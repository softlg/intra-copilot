package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentFeedback;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.springframework.dao.DuplicateKeyException;

@Mapper
public interface AgentFeedbackRepository extends BaseMapper<AgentFeedback> {
    record Filter(
            String agentId,
            String rating,
            String reasonCode,
            Instant from,
            Instant to,
            String keyword,
            boolean includeRetracted) {}

    default AgentFeedback save(AgentFeedback value) {
        if (selectById(value.getId()) != null) {
            updateById(value);
            return value;
        }
        try {
            insert(value);
            return value;
        } catch (DuplicateKeyException conflict) {
            AgentFeedback existing =
                    findBySourceAndUserIdAndMessageId(
                                    value.getSource(), value.getUserId(), value.getMessageId())
                            .orElseThrow(() -> conflict);
            mergeState(existing, value);
            updateById(existing);
            return existing;
        }
    }

    default Optional<AgentFeedback> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<AgentFeedback> findAllByOrderByCreatedAtDesc() {
        return selectList(Wrappers.<AgentFeedback>query().orderByDesc("created_at"));
    }

    default Optional<AgentFeedback> findBySourceAndUserIdAndMessageId(
            String source, String userId, String messageId) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<AgentFeedback>query()
                                .eq("source", source)
                                .eq("user_id", userId)
                                .eq("message_id", messageId)
                                .last("LIMIT 1")));
    }

    default List<AgentFeedback> find(Filter filter) {
        return selectList(buildQuery(filter));
    }

    default long count(Filter filter) {
        return selectCount(buildQuery(filter));
    }

    default List<AgentFeedback> findPage(Filter filter, int page, int size) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        return selectList(
                buildQuery(filter)
                        .orderByDesc("rated_at")
                        .orderByDesc("updated_at")
                        .last("LIMIT " + safeSize + " OFFSET " + ((safePage - 1) * safeSize)));
    }

    private QueryWrapper<AgentFeedback> buildQuery(Filter filter) {
        QueryWrapper<AgentFeedback> query = Wrappers.query();
        if (!filter.includeRetracted()) {
            query.eq("status", "ACTIVE");
        }
        if (hasText(filter.agentId())) query.eq("agent_id", filter.agentId().trim());
        if (hasText(filter.rating())) query.eq("rating", filter.rating().trim());
        if (filter.from() != null) query.ge("rated_at", filter.from());
        if (filter.to() != null) query.le("rated_at", filter.to());
        if (hasText(filter.reasonCode())) {
            String reasonCode = filter.reasonCode().trim();
            if ("MISSING".equalsIgnoreCase(reasonCode)) {
                query.and(
                                wrapper ->
                                        wrapper.and(
                                                nested ->
                                                        nested.isNull("reason_code")
                                                                .or()
                                                                .eq("reason_code", "")))
                        .and(
                                wrapper ->
                                        wrapper.and(
                                                nested ->
                                                        nested.isNull("reason_text")
                                                                .or()
                                                                .eq("reason_text", "")));
            } else {
                query.eq("reason_code", reasonCode);
            }
        }
        if (hasText(filter.keyword())) {
            String keyword = filter.keyword().trim();
            query.and(
                    wrapper ->
                            wrapper.like("user_message", keyword)
                                    .or()
                                    .like("message_content", keyword)
                                    .or()
                                    .like("reason_text", keyword));
        }
        return query;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static void mergeState(AgentFeedback target, AgentFeedback source) {
        if (target.getCreatedAt() == null) target.setCreatedAt(source.getCreatedAt());
        target.setSessionId(source.getSessionId());
        target.setMessageId(source.getMessageId());
        target.setMessageIndex(source.getMessageIndex());
        target.setAgentId(source.getAgentId());
        target.setRating(source.getRating());
        target.setComment(source.getComment());
        target.setMessageContent(source.getMessageContent());
        target.setUserMessage(source.getUserMessage());
        target.setSource(source.getSource());
        target.setUserId(source.getUserId());
        target.setReasonCode(source.getReasonCode());
        target.setReasonText(source.getReasonText());
        target.setStatus(source.getStatus());
        target.setRatedAt(source.getRatedAt());
        target.setUpdatedAt(source.getUpdatedAt());
    }
}
