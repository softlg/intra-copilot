package com.intra.copilot.infrastructure.persistence.agent;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.agent.BrowserTaskEvent;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface BrowserTaskEventRepository extends BaseMapper<BrowserTaskEvent> {
    default BrowserTaskEvent save(BrowserTaskEvent value) {
        insert(value);
        return value;
    }

    default List<BrowserTaskEvent> findByTask(String taskId) {
        return selectList(
                Wrappers.<BrowserTaskEvent>query().eq("task_id", taskId).orderByAsc("sequence_no"));
    }

    default int nextSequence(String taskId) {
        BrowserTaskEvent last =
                selectOne(
                        Wrappers.<BrowserTaskEvent>query()
                                .eq("task_id", taskId)
                                .orderByDesc("sequence_no")
                                .last("LIMIT 1"));
        return last == null ? 1 : last.getSequenceNo() + 1;
    }
}
