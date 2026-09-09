package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.MessageAttachment;
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

    default void deleteByMessageId(String messageId) {
        delete(Wrappers.<MessageAttachment>query().eq("message_id", messageId));
    }
}
