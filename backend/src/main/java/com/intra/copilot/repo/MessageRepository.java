package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.Message;
import java.util.*;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MessageRepository extends BaseMapper<Message> {
    default Message save(Message value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<Message> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default void deleteByConversationId(String conversationId) {
        delete(Wrappers.<Message>query().eq("conversation_id", conversationId));
    }

    default List<Message> findByConversationIdOrderByCreatedAtAsc(String id) {
        return selectList(Wrappers.<Message>query().eq("conversation_id", id).orderByAsc("created_at"));
    }

    default long countByConversationId(String conversationId) {
        return selectCount(Wrappers.<Message>query().eq("conversation_id", conversationId));
    }
}
