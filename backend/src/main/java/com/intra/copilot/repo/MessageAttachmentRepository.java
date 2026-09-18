package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.MessageAttachment;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MessageAttachmentRepository extends BaseMapper<MessageAttachment> {

    default MessageAttachment save(MessageAttachment value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<MessageAttachment> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<MessageAttachment> findByMessageIdOrderBySortOrderAsc(String messageId) {
        return selectList(
                Wrappers.<MessageAttachment>query()
                        .eq("message_id", messageId)
                        .orderByAsc("sort_order"));
    }

    default List<MessageAttachment> findByMessageIds(java.util.Collection<String> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) return List.of();
        return selectList(
                Wrappers.<MessageAttachment>query()
                        .in("message_id", messageIds)
                        .orderByAsc("message_id")
                        .orderByAsc("sort_order"));
    }

    default Optional<MessageAttachment> findOwned(
            String id, String ownerSource, String ownerUserId) {
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<MessageAttachment>query()
                                .eq("id", id)
                                .eq("owner_source", ownerSource)
                                .eq("owner_user_id", ownerUserId)
                                .last("LIMIT 1")));
    }

    default boolean attachOwnedPending(
            String id, String messageId, String ownerSource, String ownerUserId) {
        int updated =
                update(
                        null,
                        Wrappers.<MessageAttachment>lambdaUpdate()
                                .eq(MessageAttachment::getId, id)
                                .eq(MessageAttachment::getOwnerSource, ownerSource)
                                .eq(MessageAttachment::getOwnerUserId, ownerUserId)
                                .eq(MessageAttachment::getStatus, "PENDING")
                                .set(MessageAttachment::getMessageId, messageId)
                                .set(MessageAttachment::getStatus, "ATTACHED")
                                .set(MessageAttachment::getExpiresAt, null));
        if (updated == 1) return true;
        return findOwned(id, ownerSource, ownerUserId)
                .map(
                        attachment ->
                                messageId.equals(attachment.getMessageId())
                                        && "ATTACHED".equals(attachment.getStatus()))
                .orElse(false);
    }

    default List<MessageAttachment> findExpiredPending(Instant now, int limit) {
        return selectList(
                Wrappers.<MessageAttachment>query()
                        .eq("status", "PENDING")
                        .lt("expires_at", now)
                        .orderByAsc("expires_at")
                        .last("LIMIT " + Math.max(1, Math.min(1000, limit))));
    }

    default void deleteByMessageId(String messageId) {
        delete(Wrappers.<MessageAttachment>query().eq("message_id", messageId));
    }
}
