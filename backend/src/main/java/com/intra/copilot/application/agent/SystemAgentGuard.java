package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.AgentDefinition;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Enforces the read-only boundary for application-managed agents. */
public final class SystemAgentGuard {
    public static final String SYSTEM_LOCKED = "SYSTEM_LOCKED";
    public static final String SYSTEM_OWNER = "SYSTEM";
    public static final String USER_MANAGED = "USER_MANAGED";
    public static final String USER_OWNER = "USER";

    private SystemAgentGuard() {}

    public static void requireUserManaged(AgentDefinition definition) {
        if (definition == null) return;
        boolean locked =
                definition.isSystemAgent()
                        || SYSTEM_LOCKED.equalsIgnoreCase(definition.getManagementMode())
                        || SYSTEM_OWNER.equalsIgnoreCase(definition.getOwnerType());
        if (locked) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "系统内置 Agent 随应用版本升级，不支持修改、停用、回滚或删除");
        }
    }
}
