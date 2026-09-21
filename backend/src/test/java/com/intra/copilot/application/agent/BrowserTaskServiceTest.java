package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.infrastructure.agent.BrowserCapabilityTools;
import com.intra.copilot.infrastructure.ai.LlmClient;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskEventRepository;
import com.intra.copilot.infrastructure.persistence.agent.BrowserTaskRepository;
import com.intra.copilot.shared.identity.RequestContext;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class BrowserTaskServiceTest {

    @Test
    void createsServerBrowserTaskWithVisibleInteractionByDefault() {
        RequestContext.set("admin", "admin-1");
        BrowserTaskService service = service();

        BrowserTask task =
                service.newTask(
                        new BrowserTaskService.CreateRequest(
                                "C1",
                                null,
                                null,
                                "填写并提交表单",
                                "https://example.com/form",
                                Map.of("name", "test"),
                                Map.of("maxRisk", "medium"),
                                List.of("页面出现提交成功"),
                                8));

        assertEquals("admin-1", task.getOwnerUserId());
        assertEquals(SystemAgentCatalog.BROWSER_OPERATE, task.getCapability());
        assertEquals(BrowserRuntimeKind.SERVER.name(), task.getRuntimeKind());
        assertEquals(BrowserInteractionMode.VISIBLE_VIRTUAL.name(), task.getInteractionMode());
        assertEquals(8, task.getMaxSteps());
        assertEquals("https://example.com/form", task.getStartUrl());
    }

    @Test
    void rejectsUnsafeStartUrl() {
        RequestContext.set("admin", "admin-1");
        BrowserTaskService service = service();

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        service.newTask(
                                new BrowserTaskService.CreateRequest(
                                        null,
                                        null,
                                        null,
                                        "打开页面",
                                        "file:///C:/secret.txt",
                                        Map.of(),
                                        Map.of(),
                                        List.of(),
                                        5)));
    }

    private BrowserTaskService service() {
        return new BrowserTaskService(
                mock(BrowserTaskRepository.class),
                mock(BrowserTaskEventRepository.class),
                mock(BrowserTaskCommandService.class),
                mock(BrowserRuntimeRegistry.class),
                new BrowserCapabilityTools(new ObjectMapper()),
                new SystemAgentCatalog(),
                mock(LlmClient.class),
                new ObjectMapper(),
                2);
    }
}
