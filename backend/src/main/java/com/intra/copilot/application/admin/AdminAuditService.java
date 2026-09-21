package com.intra.copilot.application.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.application.identity.AdminUserService;
import com.intra.copilot.domain.admin.AdminOperationAudit;
import com.intra.copilot.domain.identity.AdminUser;
import com.intra.copilot.infrastructure.persistence.admin.AdminOperationAuditRepository;
import com.intra.copilot.shared.identity.RequestContext;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class AdminAuditService {
    private final AdminOperationAuditRepository audits;
    private final AdminUserService users;
    private final ObjectMapper json;

    public AdminAuditService(
            AdminOperationAuditRepository audits, AdminUserService users, ObjectMapper json) {
        this.audits = audits;
        this.users = users;
        this.json = json;
    }

    public void record(
            String action,
            String targetType,
            String targetId,
            String source,
            String sessionId,
            Object payload) {
        RequestContext.Identity identity = RequestContext.currentOrAnonymous();
        AdminOperationAudit audit = new AdminOperationAudit();
        audit.setAdminUserId(identity.userId());
        String username = identity.actorLabel();
        try {
            AdminUser user = users.requireCurrent();
            audit.setAdminUserId(user.getId());
            username = user.getUsername();
        } catch (RuntimeException ignored) {
            // Legacy test contexts may not have a database-backed account.
        }
        audit.setActorUsername(username == null ? "admin" : username);
        audit.setAction(action);
        audit.setTargetType(targetType);
        audit.setTargetId(targetId);
        audit.setSource(source);
        audit.setSessionId(sessionId);
        if (payload != null) {
            try {
                audit.setPayloadJson(json.writeValueAsString(payload));
            } catch (Exception error) {
                audit.setPayloadJson("{\"serializationError\":true}");
            }
        }
        audits.append(audit);
    }

    public List<AdminOperationAudit> recent(int limit) {
        return audits.recent(limit);
    }
}
