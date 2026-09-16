package com.intra.copilot.service;

import com.intra.copilot.model.AdminUser;
import com.intra.copilot.repo.AdminUserRepository;
import com.intra.copilot.service.auth.AdminAuthService;
import com.intra.copilot.service.auth.RequestContext;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Database-backed management accounts. Resources remain global; only sessions are per-user. */
@Service
public class AdminUserService {
    private final AdminUserRepository users;

    public AdminUserService(AdminUserRepository users) {
        this.users = users;
    }

    public List<AdminUserView> list() {
        return users.findAllOrdered().stream().map(AdminUserView::from).toList();
    }

    public AdminUser requireCurrent() {
        RequestContext.Identity identity = RequestContext.currentOrAnonymous();
        if (identity == null || identity.userId() == null || identity.userId().isBlank()) {
            throw new IllegalStateException("No authenticated administrator");
        }
        return users.findById(identity.userId())
                .orElseThrow(() -> new IllegalStateException("当前管理员账号不存在或已停用"));
    }

    public AdminUser get(String id) {
        return users.findById(id).orElseThrow(() -> new NoSuchElementException("管理员不存在"));
    }

    @Transactional
    public AdminUserView create(String username, String displayName, String password, boolean enabled) {
        String normalized = normalizeUsername(username);
        validatePassword(password);
        if (users.findByUsername(normalized).isPresent()) {
            throw new IllegalArgumentException("管理员用户名已存在");
        }
        AdminUser user = new AdminUser();
        user.setUsername(normalized);
        user.setDisplayName(trimToNull(displayName));
        user.setPasswordHash(AdminAuthService.hashPassword(password));
        user.setEnabled(enabled);
        users.save(user);
        return AdminUserView.from(user);
    }

    @Transactional
    public AdminUserView update(String id, String displayName, boolean enabled) {
        AdminUser user = get(id);
        if (!enabled && user.isEnabled() && activeCount() <= 1) {
            throw new IllegalArgumentException("至少需要保留一个启用的管理员账号");
        }
        user.setDisplayName(trimToNull(displayName));
        user.setEnabled(enabled);
        user.touch();
        users.save(user);
        return AdminUserView.from(user);
    }

    @Transactional
    public void resetPassword(String id, String password) {
        validatePassword(password);
        AdminUser user = get(id);
        user.setPasswordHash(AdminAuthService.hashPassword(password));
        user.touch();
        users.save(user);
    }

    private long activeCount() {
        return users.findAllOrdered().stream().filter(AdminUser::isEnabled).count();
    }

    private static String normalizeUsername(String username) {
        String value = username == null ? "" : username.trim();
        if (!value.matches("[A-Za-z0-9_.-]{3,64}")) {
            throw new IllegalArgumentException("用户名只能使用 3-64 位字母、数字、点、下划线或连字符");
        }
        return value;
    }

    private static void validatePassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 200) {
            throw new IllegalArgumentException("密码长度必须为 8-200 位");
        }
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public record AdminUserView(
            String id,
            String username,
            String displayName,
            boolean enabled,
            Instant lastLoginAt,
            Instant createdAt,
            Instant updatedAt) {
        static AdminUserView from(AdminUser user) {
            return new AdminUserView(
                    user.getId(),
                    user.getUsername(),
                    user.getDisplayName(),
                    user.isEnabled(),
                    user.getLastLoginAt(),
                    user.getCreatedAt(),
                    user.getUpdatedAt());
        }
    }
}
