package com.intra.copilot.repo;

import com.intra.copilot.model.AgentFeedback;
import java.util.List;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentFeedbackRepository extends BaseMapper<AgentFeedback> {
  default AgentFeedback save(AgentFeedback value) { if (selectById(value.getId()) == null) insert(value); else updateById(value); return value; }
  default Optional<AgentFeedback> findById(String id) { return Optional.ofNullable(selectById(id)); }
  default List<AgentFeedback> findAllByOrderByCreatedAtDesc() { return selectList(Wrappers.<AgentFeedback>query().orderByDesc("created_at")); }
}
