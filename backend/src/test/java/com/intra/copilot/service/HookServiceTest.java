package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.HookBinding;
import com.intra.copilot.model.HookDefinition;
import com.intra.copilot.repo.AgentInvocationEventRepository;
import com.intra.copilot.repo.HookAuditLogRepository;
import com.intra.copilot.repo.HookBindingRepository;
import com.intra.copilot.repo.HookDefinitionRepository;
import com.intra.copilot.repo.HookDefinitionVersionRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class HookServiceTest {

    @Test
    void keywordBlockNormalizesCaseAndUnicode() {
        HookDefinition keyword = hook("keyword", "KEYWORD_BLOCK", "PRE_ROUTE");
        keyword.setRuleConfig("{\"keywords\":[\"ＤＥＬＥＴＥ\"]}");
        HookService service = service(List.of(keyword), List.of(global("keyword")));

        List<HookService.HookCheck> checks =
                service.checks(context("delete production data", "PRE_ROUTE", "agent", true));

        assertEquals(1, checks.size());
        assertFalse(checks.get(0).passed());
    }

    @Test
    void agentBindingOnlyRunsForMatchingAgent() {
        HookDefinition scoped = hook("scoped", "REQUIRE_PAGE_CONTEXT", "PRE_AGENT");
        HookBinding binding = global("scoped");
        binding.setTargetType("AGENT");
        binding.setTargetId("finance-agent");
        HookService service = service(List.of(scoped), List.of(binding));

        assertTrue(service.checks(context("hello", "PRE_AGENT", "other-agent", true)).isEmpty());
        assertEquals(
                1, service.checks(context("hello", "PRE_AGENT", "finance-agent", true)).size());
    }

    @Test
    void pageContextRuleUsesEffectiveContext() {
        HookDefinition page = hook("page", "REQUIRE_PAGE_CONTEXT", "PRE_ROUTE");
        HookService service = service(List.of(page), List.of(global("page")));

        HookService.HookCheck denied =
                service.checks(context("hello", "PRE_ROUTE", "agent", false)).get(0);
        HookService.HookCheck allowed =
                service.checks(context("hello", "PRE_ROUTE", "agent", true)).get(0);

        assertFalse(denied.passed());
        assertTrue(allowed.passed());
    }

    @Test
    void invalidRuleFailsClosedByDefault() {
        HookDefinition invalid = hook("invalid", "KEYWORD_BLOCK", "PRE_ROUTE");
        invalid.setRuleConfig("not-json");
        HookService service = service(List.of(invalid), List.of(global("invalid")));

        HookService.HookCheck check =
                service.checks(context("hello", "PRE_ROUTE", "agent", true)).get(0);

        assertFalse(check.passed());
        assertTrue(check.evaluationError() != null);
    }

    @Test
    void warnFailModeAllowsRequestWhenRuleCannotBeEvaluated() {
        HookDefinition invalid = hook("invalid", "KEYWORD_BLOCK", "PRE_ROUTE");
        invalid.setRuleConfig("not-json");
        invalid.setFailMode("WARN");
        HookService service = service(List.of(invalid), List.of(global("invalid")));

        HookService.HookCheck check =
                service.checks(context("hello", "PRE_ROUTE", "agent", true)).get(0);

        assertTrue(check.passed());
        assertTrue(check.evaluationError() != null);
    }

    @Test
    void requestBudgetChecksMessagePageAndTotalLengths() {
        HookDefinition budget = hook("budget", "REQUEST_BUDGET", "PRE_ROUTE");
        budget.setRuleConfig(
                "{\"messageMaxLength\":5,\"pageContextMaxLength\":6,\"totalMaxLength\":9}");
        HookService service = service(List.of(budget), List.of(global("budget")));

        HookService.HookCheck allowed =
                service.checks(context("12345", "1234", "PRE_ROUTE", "agent", true)).get(0);
        HookService.HookCheck messageTooLong =
                service.checks(context("123456", "", "PRE_ROUTE", "agent", true)).get(0);
        HookService.HookCheck pageTooLong =
                service.checks(context("", "1234567", "PRE_ROUTE", "agent", true)).get(0);
        HookService.HookCheck totalTooLong =
                service.checks(context("12345", "12345", "PRE_ROUTE", "agent", true)).get(0);

        assertTrue(allowed.passed());
        assertFalse(messageTooLong.passed());
        assertFalse(pageTooLong.passed());
        assertFalse(totalTooLong.passed());
    }

    @Test
    void rejectsNonGlobalBindingForPreRouteRule() {
        HookDefinition route = hook("route", "KEYWORD_BLOCK", "PRE_ROUTE");
        route.setRuleConfig("{\"keywords\":[\"blocked\"]}");
        HookBinding binding = global("route");
        binding.setTargetType("AGENT");
        binding.setTargetId("agent-1");
        route.setBindings(List.of(binding));
        HookService service = service(List.of(), List.of());

        HookService.HookValidationResult result = service.validateDefinition(route);

        assertFalse(result.valid());
        assertTrue(result.errors().get(0).contains("路由前规则仅支持全局作用域"));
    }

    @Test
    void rejectsKeywordRuleWithoutEffectiveKeywords() {
        HookDefinition keyword = hook("keyword", "KEYWORD_BLOCK", "PRE_ROUTE");
        keyword.setRuleConfig("{\"keywords\":[\" \", \"\"]}");
        HookService service = service(List.of(), List.of());

        HookService.HookValidationResult result = service.validateDefinition(keyword);

        assertFalse(result.valid());
        assertTrue(result.errors().get(0).contains("有效关键词"));
    }

    @Test
    void createPersistsNormalizedAgentBinding() {
        HookDefinition scoped = hook("scoped", "REQUIRE_PAGE_CONTEXT", "PRE_AGENT");
        HookBinding binding = global("scoped");
        binding.setTargetType("agent");
        binding.setTargetId(" finance-agent ");
        scoped.setBindings(List.of(binding));

        HookDefinitionRepository repository = mock(HookDefinitionRepository.class);
        HookBindingRepository bindingRepository = mock(HookBindingRepository.class);
        HookDefinitionVersionRepository versions = mock(HookDefinitionVersionRepository.class);
        HookAuditLogRepository audits = mock(HookAuditLogRepository.class);
        AgentInvocationEventRepository events = mock(AgentInvocationEventRepository.class);
        AtomicReference<HookDefinition> stored = new AtomicReference<>();
        AtomicReference<List<HookBinding>> storedBindings = new AtomicReference<>(List.of());
        when(repository.findAll()).thenReturn(List.of());
        when(repository.save(any()))
                .thenAnswer(
                        invocation -> {
                            HookDefinition value = invocation.getArgument(0);
                            stored.set(value);
                            return value;
                        });
        when(repository.findById(any()))
                .thenAnswer(invocation -> Optional.ofNullable(stored.get()));
        doAnswer(
                        invocation -> {
                            List<HookBinding> values = new ArrayList<>(invocation.getArgument(1));
                            storedBindings.set(values);
                            return null;
                        })
                .when(bindingRepository)
                .replace(any(), any());
        when(bindingRepository.findByHookId(any())).thenAnswer(invocation -> storedBindings.get());

        HookService service =
                new HookService(repository, bindingRepository, versions, audits, events);

        HookDefinition result = service.create(scoped, "admin");

        assertEquals("AGENT", result.getBindings().get(0).getTargetType());
        assertEquals("finance-agent", result.getBindings().get(0).getTargetId());
        verify(bindingRepository)
                .replace(
                        any(),
                        argThat(
                                values ->
                                        values.size() == 1
                                                && "AGENT".equals(values.get(0).getTargetType())
                                                && "finance-agent"
                                                        .equals(values.get(0).getTargetId())));
    }

    private HookService service(List<HookDefinition> definitions, List<HookBinding> bindings) {
        HookDefinitionRepository repository = mock(HookDefinitionRepository.class);
        HookBindingRepository bindingRepository = mock(HookBindingRepository.class);
        HookDefinitionVersionRepository versions = mock(HookDefinitionVersionRepository.class);
        HookAuditLogRepository audits = mock(HookAuditLogRepository.class);
        AgentInvocationEventRepository events = mock(AgentInvocationEventRepository.class);
        when(repository.findAll()).thenReturn(definitions);
        when(bindingRepository.findByHookIds(any())).thenReturn(bindings);
        return new HookService(repository, bindingRepository, versions, audits, events);
    }

    private HookService.Context context(
            String message, String phase, String agentId, boolean consent) {
        return context(message, consent ? "page" : "", phase, agentId, consent);
    }

    private HookService.Context context(
            String message, String pageContext, String phase, String agentId, boolean consent) {
        return new HookService.Context(
                message, pageContext, agentId, "SUB", phase, consent, Map.of(), 0);
    }

    private HookDefinition hook(String id, String ruleType, String phase) {
        HookDefinition hook = new HookDefinition();
        hook.setId(id);
        hook.setName(id);
        hook.setRuleType(ruleType);
        hook.setPhase(phase);
        hook.setEnabled(true);
        hook.setVersion(1);
        hook.setPriority(100);
        return hook;
    }

    private HookBinding global(String hookId) {
        HookBinding binding = new HookBinding();
        binding.setHookId(hookId);
        binding.setTargetType("GLOBAL");
        binding.setTargetId("*");
        return binding;
    }
}
