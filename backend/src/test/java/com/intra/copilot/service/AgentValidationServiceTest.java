package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AdminUser;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AgentValidationRun;
import com.intra.copilot.repo.AgentValidationCaseRepository;
import com.intra.copilot.repo.AgentValidationRunRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

class AgentValidationServiceTest {

    @Test
    void generatesCasesWithoutExecutingOrPersistingThem() {
        AgentConfigurationService agentConfigurations = mock(AgentConfigurationService.class);
        AgentValidationRunRepository runs = mock(AgentValidationRunRepository.class);
        LlmClient llm = mock(LlmClient.class);
        AgentDefinition agent = agent();
        when(agentConfigurations.get("agent-1")).thenReturn(agent);
        when(llm.complete(any(), any(), any()))
                .thenReturn(
                        Mono.just(
                                """
                                {"cases":[{"title":"正常","input":"你好","pageContext":"","expected":"回答职责"}]}
                                """));

        AgentValidationService service = service(agentConfigurations, runs, llm);

        Map<String, Object> result = service.generateValidationCases("agent-1");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> values = (List<Map<String, Object>>) result.get("cases");
        assertEquals(1, values.size());
        assertEquals("正常", values.get(0).get("title"));
        verify(runs, never()).save(any());
    }

    @Test
    void behaviorValidationRequiresAnExplicitSelection() {
        AgentValidationService service =
                service(mock(AgentConfigurationService.class), mock(AgentValidationRunRepository.class), mock(LlmClient.class));

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                service.validateBehavior(
                                        "agent-1",
                                        new AgentValidationService.BehaviorRequest(List.of())));

        assertTrue(error.getMessage().contains("勾选"));
    }

    @Test
    void remediationUsesOneCompletePromptAndRejectsUnsupportedFields() {
        AgentConfigurationService agentConfigurations = mock(AgentConfigurationService.class);
        LlmClient llm = mock(LlmClient.class);
        when(agentConfigurations.get("agent-1")).thenReturn(agent());
        when(llm.complete(any(), any(), any()))
                .thenReturn(
                        Mono.just(
                                """
                                {
                                  "summary":"已覆盖失败场景",
                                  "patch":{
                                    "systemPrompt":"完整修订后的系统提示词，必须拒绝越界请求。",
                                    "description":"补充后的职责描述",
                                    "model":"not-allowed"
                                  }
                                }
                                """));
        AgentValidationService service =
                service(
                        agentConfigurations,
                        mock(AgentValidationRunRepository.class),
                        llm);

        Map<String, Object> result =
                service.generateRemediation(
                        "agent-1",
                        new AgentValidationService.RemediationRequest(
                                List.of(
                                        new AgentValidationService.RemediationCaseRequest(
                                                "越界请求",
                                                "执行不允许的操作",
                                                "明确拒绝",
                                                "尝试执行",
                                                "缺少拒绝边界",
                                                Map.of())),
                                null,
                                null,
                                null));

        @SuppressWarnings("unchecked")
        Map<String, Object> patch = (Map<String, Object>) result.get("patch");
        assertEquals("完整修订后的系统提示词，必须拒绝越界请求。", patch.get("systemPrompt"));
        assertEquals("补充后的职责描述", patch.get("description"));
        assertTrue(!patch.containsKey("model"));
        assertEquals(1, result.get("sourceCaseCount"));
    }

    @Test
    void remediationFallbackBuildsACompletePromptFromAllFailures() {
        AgentConfigurationService agentConfigurations = mock(AgentConfigurationService.class);
        LlmClient llm = mock(LlmClient.class);
        when(agentConfigurations.get("agent-1")).thenReturn(agent());
        when(llm.complete(any(), any(), any())).thenReturn(Mono.empty());
        AgentValidationService service =
                service(
                        agentConfigurations,
                        mock(AgentValidationRunRepository.class),
                        llm);

        Map<String, Object> result =
                service.generateRemediation(
                        "agent-1",
                        new AgentValidationService.RemediationRequest(
                                List.of(
                                        new AgentValidationService.RemediationCaseRequest(
                                                "无配置职责",
                                                "你负责什么",
                                                "不得虚构职责",
                                                "虚构了多个业务职责",
                                                "回答包含无依据的业务事实",
                                                Map.of())),
                                "当前表单中的系统提示词",
                                "当前表单中的描述",
                                ""));

        @SuppressWarnings("unchecked")
        Map<String, Object> patch = (Map<String, Object>) result.get("patch");
        String systemPrompt = String.valueOf(patch.get("systemPrompt"));
        assertTrue(systemPrompt.contains("当前表单中的系统提示词"));
        assertTrue(systemPrompt.contains("不得虚构职责"));
        assertTrue(systemPrompt.contains("回答包含无依据的业务事实"));
    }

    @Test
    void behaviorSuggestionAppendsPromptAdditionInsteadOfReplacingTheOriginal() {
        AgentConfigurationService agentConfigurations = mock(AgentConfigurationService.class);
        AgentValidationRunRepository runs = mock(AgentValidationRunRepository.class);
        AgentValidationCaseRepository cases = mock(AgentValidationCaseRepository.class);
        AdminUserService users = mock(AdminUserService.class);
        LlmClient llm = mock(LlmClient.class);
        AgentDefinition agent = agent();
        AdminUser user = new AdminUser();
        user.setId("admin-1");
        when(agentConfigurations.get("agent-1")).thenReturn(agent);
        when(runs.save(any(AgentValidationRun.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(users.requireCurrent()).thenReturn(user);
        when(llm.complete(any(), any(), any()))
                .thenReturn(
                        Mono.just("实际回答"),
                        Mono.just(
                                """
                                {
                                  "passed":false,
                                  "reason":"缺少成功承诺边界",
                                  "suggestedPatch":{
                                    "systemPrompt":"补充规则：不得承诺操作一定成功。"
                                  }
                                }
                                """));
        AgentValidationService service =
                new AgentValidationService(
                        agentConfigurations,
                        runs,
                        cases,
                        mock(KnowledgeBaseRepository.class),
                        mock(ToolDefinitionRepository.class),
                        mock(SkillDefinitionRepository.class),
                        llm,
                        new ObjectMapper(),
                        users,
                        mock(AdminAuditService.class));

        Map<String, Object> report =
                service.validateBehavior(
                        "agent-1",
                        new AgentValidationService.BehaviorRequest(
                                List.of(
                                        new AgentValidationService.ValidationCaseRequest(
                                                "成功承诺",
                                                "你能保证一定成功吗？",
                                                "",
                                                "不得承诺一定成功"))));

        @SuppressWarnings("unchecked")
        Map<String, Object> result =
                (Map<String, Object>) ((List<?>) report.get("cases")).get(0);
        @SuppressWarnings("unchecked")
        Map<String, Object> patch = (Map<String, Object>) result.get("suggestedPatch");
        String systemPrompt = String.valueOf(patch.get("systemPrompt"));
        assertTrue(systemPrompt.startsWith(agent.getSystemPrompt()));
        assertTrue(systemPrompt.contains("补充验证要求（场景：成功承诺）"));
        assertTrue(systemPrompt.contains("不得承诺操作一定成功"));
    }

    @Test
    void staticValidationPersistsAReport() {
        AgentConfigurationService agentConfigurations = mock(AgentConfigurationService.class);
        AgentValidationRunRepository runs = mock(AgentValidationRunRepository.class);
        AgentValidationCaseRepository cases = mock(AgentValidationCaseRepository.class);
        AdminUserService users = mock(AdminUserService.class);
        AdminAuditService audits = mock(AdminAuditService.class);
        AgentDefinition agent = agent();
        when(agentConfigurations.get("agent-1")).thenReturn(agent);
        when(runs.save(any(AgentValidationRun.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        AdminUser user = new AdminUser();
        user.setId("admin-1");
        when(users.requireCurrent()).thenReturn(user);

        AgentValidationService service =
                new AgentValidationService(
                        agentConfigurations,
                        runs,
                        cases,
                        mock(KnowledgeBaseRepository.class),
                        mock(ToolDefinitionRepository.class),
                        mock(SkillDefinitionRepository.class),
                        mock(LlmClient.class),
                        new ObjectMapper(),
                        users,
                        audits);

        Map<String, Object> report = service.validateStatic("agent-1");

        assertEquals("STATIC_COMPLETE", report.get("status"));
        assertTrue(((List<?>) report.get("cases")).isEmpty());
        verify(runs, times(2)).save(any(AgentValidationRun.class));
        verify(audits).record(any(), any(), any(), any(), any(), any());
    }

    private static AgentValidationService service(
            AgentConfigurationService agentConfigurations,
            AgentValidationRunRepository runs,
            LlmClient llm) {
        return new AgentValidationService(
                agentConfigurations,
                runs,
                mock(AgentValidationCaseRepository.class),
                mock(KnowledgeBaseRepository.class),
                mock(ToolDefinitionRepository.class),
                mock(SkillDefinitionRepository.class),
                llm,
                new ObjectMapper(),
                mock(AdminUserService.class),
                mock(AdminAuditService.class));
    }

    private static AgentDefinition agent() {
        AgentDefinition agent = new AgentDefinition();
        agent.setId("agent-1");
        agent.setDisplayName("测试 Agent");
        agent.setDescription("负责回答测试问题");
        agent.setSystemPrompt("你负责回答测试问题。信息不足时必须询问，不得编造事实，必须拒绝越界请求。");
        agent.setRole("DOMAIN");
        agent.setKnowledgeBaseIds("[]");
        agent.setToolIds("[]");
        agent.setSkillIds("[]");
        return agent;
    }
}
