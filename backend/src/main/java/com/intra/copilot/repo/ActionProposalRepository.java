package com.intra.copilot.repo;

import com.intra.copilot.model.ActionProposal;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ActionProposalRepository extends BaseMapper<ActionProposal> {
  default ActionProposal save(ActionProposal value) { if (selectById(value.getActionId()) == null) insert(value); else updateById(value); return value; }
  default Optional<ActionProposal> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default void deleteByConversationId(String id) { delete(Wrappers.<ActionProposal>query().eq("conversation_id", id)); }
  default List<ActionProposal> findByConversationIdOrderByExpiresAtAsc(String id) { return selectList(Wrappers.<ActionProposal>query().eq("conversation_id", id).orderByAsc("expires_at")); }
}
