package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.Conversation;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ConversationRepository extends BaseMapper<Conversation> {
    default Conversation save(Conversation value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<Conversation> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default boolean existsById(String id) {
        return selectById(id) != null;
    }

    default List<Conversation> findAllByOrderByUpdatedAtDesc() {
        // sort_order 优先（拖拽排序），NULL 兜底到 updated_at 倒序。
        return selectList(
                Wrappers.<Conversation>query()
                        .orderByAsc("sort_order")
                        .orderByDesc("updated_at"));
    }
}
