package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AgentInvocationEvent;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentInvocationEventRepository extends BaseMapper<AgentInvocationEvent> {
  default AgentInvocationEvent save(AgentInvocationEvent value) {
    if (selectById(value.getId()) == null) insert(value);
    else updateById(value);
    return value;
  }

  default Optional<AgentInvocationEvent> findById(String id) {
    return Optional.ofNullable(selectById(id));
  }

  default List<AgentInvocationEvent> findByInvocationIdOrderBySequenceAsc(String invocationId) {
    return selectList(
        Wrappers.<AgentInvocationEvent>query()
            .eq("invocation_id", invocationId)
            .orderByAsc("sequence"));
  }

  default List<AgentInvocationEvent> findByCorrelationIdOrderByCreatedAtAsc(String correlationId) {
    return selectList(
        Wrappers.<AgentInvocationEvent>query()
            .eq("correlation_id", correlationId)
            .orderByAsc("created_at"));
  }

  default int nextSequence(String invocationId) {
    Integer max =
        selectList(
                Wrappers.<AgentInvocationEvent>query()
                    .eq("invocation_id", invocationId)
                    .orderByDesc("sequence")
                    .last("LIMIT 1"))
            .stream()
            .findFirst()
            .map(AgentInvocationEvent::getSequence)
            .orElse(0);
    return max + 1;
  }
}
