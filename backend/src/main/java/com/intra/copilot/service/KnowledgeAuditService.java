package com.intra.copilot.service;

import com.intra.copilot.model.KnowledgeAuditLog;
import com.intra.copilot.repo.KnowledgeAuditLogRepository;
import com.intra.copilot.service.auth.RequestContext;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Records who changed a knowledge base and when.
 *
 * <p>Admin endpoints are not authenticated today, so the actor falls back to the
 * {@code X-Actor} header and finally to {@code system}. Wiring real authentication in
 * later only requires the header/identity lookup below to stay as is.
 */
@Service
public class KnowledgeAuditService {

    private final KnowledgeAuditLogRepository auditLog;

    public KnowledgeAuditService(KnowledgeAuditLogRepository auditLog) {
        this.auditLog = auditLog;
    }

    public void record(String baseId, String documentId, String action, String detail) {
        KnowledgeAuditLog entry = new KnowledgeAuditLog();
        entry.setKnowledgeBaseId(baseId);
        entry.setDocumentId(documentId);
        entry.setActor(resolveActor());
        entry.setAction(action);
        entry.setDetail(detail);
        auditLog.record(entry);
    }

    public List<KnowledgeAuditLog> recent(String baseId, int limit) {
        return auditLog.findRecentByKnowledgeBaseId(baseId, limit);
    }

    private String resolveActor() {
        var identity = RequestContext.currentOrAnonymous();
        if (identity != null && identity.userId() != null && !"anonymous".equals(identity.userId())) {
            return identity.userId();
        }
        var attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servlet) {
            String header = servlet.getRequest().getHeader("X-Actor");
            if (header != null && !header.isBlank()) return header.trim();
        }
        return "system";
    }
}
