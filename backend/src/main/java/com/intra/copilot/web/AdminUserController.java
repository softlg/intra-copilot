package com.intra.copilot.web;

import com.intra.copilot.service.AdminAuditService;
import com.intra.copilot.service.AdminUserService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {
    private final AdminUserService users;
    private final AdminAuditService audits;

    public AdminUserController(AdminUserService users, AdminAuditService audits) {
        this.users = users;
        this.audits = audits;
    }

    @GetMapping
    public List<AdminUserService.AdminUserView> list() {
        return users.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminUserService.AdminUserView create(@RequestBody CreateUserRequest request) {
        AdminUserService.AdminUserView created =
                users.create(
                        request == null ? null : request.username(),
                        request == null ? null : request.displayName(),
                        request == null ? null : request.password(),
                        request == null || request.enabled() == null || request.enabled());
        audits.record("CREATE", "ADMIN_USER", created.id(), "MANUAL", null, created);
        return created;
    }

    @PutMapping("/{id}")
    public AdminUserService.AdminUserView update(
            @PathVariable String id, @RequestBody UpdateUserRequest request) {
        AdminUserService.AdminUserView updated =
                users.update(
                        id,
                        request == null ? null : request.displayName(),
                        request != null && Boolean.TRUE.equals(request.enabled()));
        audits.record("UPDATE", "ADMIN_USER", id, "MANUAL", null, updated);
        return updated;
    }

    @PostMapping("/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@PathVariable String id, @RequestBody ResetPasswordRequest request) {
        users.resetPassword(id, request == null ? null : request.password());
        audits.record("RESET_PASSWORD", "ADMIN_USER", id, "MANUAL", null, null);
    }

    public record CreateUserRequest(
            String username, String displayName, String password, Boolean enabled) {}

    public record UpdateUserRequest(String displayName, Boolean enabled) {}

    public record ResetPasswordRequest(String password) {}
}
