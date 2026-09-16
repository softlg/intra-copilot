package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.AdminUser;
import java.util.List;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AdminUserRepository extends BaseMapper<AdminUser> {
    default AdminUser save(AdminUser value) {
        if (selectById(value.getId()) == null) insert(value);
        else updateById(value);
        return value;
    }

    default Optional<AdminUser> findByUsername(String username) {
        if (username == null || username.isBlank()) return Optional.empty();
        return Optional.ofNullable(
                selectOne(
                        Wrappers.<AdminUser>query()
                                .apply("LOWER(username) = LOWER({0})", username.trim())
                                .last("LIMIT 1")));
    }

    default Optional<AdminUser> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default List<AdminUser> findAllOrdered() {
        return selectList(Wrappers.<AdminUser>query().orderByAsc("username"));
    }
}
