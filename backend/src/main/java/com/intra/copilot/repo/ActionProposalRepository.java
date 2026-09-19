package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.ActionProposal;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ActionProposalRepository extends BaseMapper<ActionProposal> {
    default ActionProposal save(ActionProposal value) {
        if (selectById(value.getActionId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<ActionProposal> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default void deleteByConversationId(String id) {
        delete(Wrappers.<ActionProposal>query().eq("conversation_id", id));
    }

    default List<ActionProposal> findByConversationIdOrderByExpiresAtAsc(String id) {
        return selectList(
                Wrappers.<ActionProposal>query()
                        .eq("conversation_id", id)
                        .orderByAsc("expires_at"));
    }

    @Update(
            """
            UPDATE action_proposal
            SET status = #{status},
                result = #{result}
            WHERE action_id = #{actionId}
              AND status = 'PENDING'
            """)
    int resolvePending(
            @Param("actionId") String actionId,
            @Param("status") String status,
            @Param("result") String result);
}
