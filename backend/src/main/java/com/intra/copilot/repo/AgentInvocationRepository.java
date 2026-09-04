package com.intra.copilot.repo;

import com.intra.copilot.model.AgentInvocation;
import java.util.List;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentInvocationRepository extends BaseMapper<AgentInvocation> {
  default AgentInvocation save(AgentInvocation value) { if (selectById(value.getId()) == null) insert(value); else updateById(value); return value; }
  default Optional<AgentInvocation> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default List<AgentInvocation> findByConversationIdOrderByCreatedAtAsc(String conversationId) { return selectList(Wrappers.<AgentInvocation>query().eq("conversation_id", conversationId).orderByAsc("created_at")); }
}
