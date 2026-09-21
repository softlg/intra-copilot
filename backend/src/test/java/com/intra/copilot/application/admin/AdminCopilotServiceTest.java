package com.intra.copilot.application.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.application.agent.AgentConfigurationService;
import com.intra.copilot.application.agent.AgentRegistry;
import com.intra.copilot.application.agent.SystemAgentGuard;
import com.intra.copilot.application.capability.HookService;
import com.intra.copilot.application.capability.McpServerService;
import com.intra.copilot.application.capability.SkillManagementService;
import com.intra.copilot.application.capability.ToolManagementService;
import com.intra.copilot.application.identity.AdminUserService;
import com.intra.copilot.application.knowledge.KnowledgeService;
import com.intra.copilot.domain.admin.AdminCopilotSession;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.identity.AdminUser;
import com.intra.copilot.infrastructure.ai.LlmClient;
import com.intra.copilot.infrastructure.conversation.SseExecutionService;
import com.intra.copilot.infrastructure.persistence.admin.AdminCopilotMessageRepository;
import com.intra.copilot.infrastructure.persistence.admin.AdminCopilotProposalRepository;
import com.intra.copilot.infrastructure.persistence.admin.AdminCopilotSessionRepository;
import com.intra.copilot.infrastructure.persistence.capability.SkillDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.capability.ToolDefinitionRepository;
import com.intra.copilot.infrastructure.persistence.knowledge.KnowledgeBaseRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AdminCopilotServiceTest {
    @Test
    void createSessionAcceptsValidationMode() {
        AdminCopilotSessionRepository sessions = mock(AdminCopilotSessionRepository.class);
        AdminCopilotMessageRepository messages = mock(AdminCopilotMessageRepository.class);
        AdminCopilotProposalRepository proposals = mock(AdminCopilotProposalRepository.class);
        AdminUserService users = mock(AdminUserService.class);
        AdminUser user = new AdminUser();
        user.setId("admin-1");
        when(users.requireCurrent()).thenReturn(user);
        when(messages.findBySession(anyString())).thenReturn(List.of());
        when(proposals.findBySession(anyString())).thenReturn(List.of());

        AdminCopilotService service =
                new AdminCopilotService(
                        sessions,
                        messages,
                        proposals,
                        users,
                        mock(AdminAuditService.class),
                        mock(LlmClient.class),
                        new ObjectMapper(),
                        mock(AgentRegistry.class),
                        mock(AgentConfigurationService.class),
                        mock(ToolManagementService.class),
                        mock(KnowledgeService.class),
                        mock(SkillManagementService.class),
                        mock(HookService.class),
                        mock(McpServerService.class),
                        mock(KnowledgeBaseRepository.class),
                        mock(ToolDefinitionRepository.class),
                        mock(SkillDefinitionRepository.class),
                        mock(SseExecutionService.class));

        Map<String, Object> result = service.createSession("VALIDATE", null, "AG-1");

        assertEquals("VALIDATE", result.get("mode"));
        assertEquals("验证会话", result.get("title"));
        assertEquals("AG-1", result.get("currentAgentId"));
    }

    @Test
    void createSessionRejectsUnknownMode() {
        AdminUserService users = mock(AdminUserService.class);
        AdminUser user = new AdminUser();
        user.setId("admin-1");
        when(users.requireCurrent()).thenReturn(user);
        AdminCopilotService service =
                new AdminCopilotService(
                        mock(AdminCopilotSessionRepository.class),
                        mock(AdminCopilotMessageRepository.class),
                        mock(AdminCopilotProposalRepository.class),
                        users,
                        mock(AdminAuditService.class),
                        mock(LlmClient.class),
                        new ObjectMapper(),
                        mock(AgentRegistry.class),
                        mock(AgentConfigurationService.class),
                        mock(ToolManagementService.class),
                        mock(KnowledgeService.class),
                        mock(SkillManagementService.class),
                        mock(HookService.class),
                        mock(McpServerService.class),
                        mock(KnowledgeBaseRepository.class),
                        mock(ToolDefinitionRepository.class),
                        mock(SkillDefinitionRepository.class),
                        mock(SseExecutionService.class));

        assertThrows(
                IllegalArgumentException.class, () -> service.createSession("UNKNOWN", null, null));
    }

    @Test
    void stripsPatchForSystemLockedAgent() {
        AgentRegistry agents = mock(AgentRegistry.class);
        AgentDefinition locked = new AgentDefinition();
        locked.setId("browser-operator");
        locked.setSystemAgent(true);
        locked.setOwnerType(SystemAgentGuard.SYSTEM_OWNER);
        locked.setManagementMode(SystemAgentGuard.SYSTEM_LOCKED);
        when(agents.allDefinitions()).thenReturn(List.of(locked));
        AdminCopilotService service =
                new AdminCopilotService(
                        mock(AdminCopilotSessionRepository.class),
                        mock(AdminCopilotMessageRepository.class),
                        mock(AdminCopilotProposalRepository.class),
                        mock(AdminUserService.class),
                        mock(AdminAuditService.class),
                        mock(LlmClient.class),
                        new ObjectMapper(),
                        agents,
                        mock(AgentConfigurationService.class),
                        mock(ToolManagementService.class),
                        mock(KnowledgeService.class),
                        mock(SkillManagementService.class),
                        mock(HookService.class),
                        mock(McpServerService.class),
                        mock(KnowledgeBaseRepository.class),
                        mock(ToolDefinitionRepository.class),
                        mock(SkillDefinitionRepository.class),
                        mock(SseExecutionService.class));
        AdminCopilotSession session = new AdminCopilotSession();
        session.setCurrentAgentId("browser-operator");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reply", "建议修改提示词。");
        result.put(
                "patch",
                Map.of(
                        "agentId",
                        "browser-operator",
                        "changes",
                        Map.of("systemPrompt", "override")));

        Map<String, Object> safe = service.enforceSystemAgentPatchBoundary(session, result);

        assertEquals(Map.of(), safe.get("patch"));
        assertTrue(String.valueOf(safe.get("reply")).contains("系统内置 Agent"));
    }
}
