package com.intra.copilot.infrastructure.persistence.capability;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.domain.capability.HookBinding;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface HookBindingRepository extends BaseMapper<HookBinding> {
    default List<HookBinding> findByHookId(String hookId) {
        return selectList(
                Wrappers.<HookBinding>query().eq("hook_id", hookId).orderByAsc("created_at"));
    }

    default List<HookBinding> findByHookIds(Collection<String> hookIds) {
        if (hookIds == null || hookIds.isEmpty()) return List.of();
        return selectList(Wrappers.<HookBinding>query().in("hook_id", hookIds));
    }

    default void replace(String hookId, List<HookBinding> bindings) {
        delete(Wrappers.<HookBinding>query().eq("hook_id", hookId));
        if (bindings == null) return;
        for (HookBinding binding : bindings) {
            binding.setHookId(hookId);
            insert(binding);
        }
    }
}
