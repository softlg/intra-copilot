package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.service.AgentConfigurationService;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.LlmClient;
import java.util.Map;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

class AgentAdminControllerTest {

    @Test
    void testUsesCurrentDraftDefinitionWithoutRequiringPublish() {
        AgentRegistry registry = mock(AgentRegistry.class);
        LlmClient llm = mock(LlmClient.class);
        AgentConfigurationService configurations = mock(AgentConfigurationService.class);
        AgentDefinition draft = new AgentDefinition();
        draft.setId("draft-agent");
        draft.setDisplayName("Draft Agent");
        draft.setSystemPrompt("draft prompt");
        draft.setRole("DOMAIN");
        draft.setEnabled(false);
        draft.setPublished(false);
        when(configurations.get("draft-agent")).thenReturn(draft);
        when(llm.complete(anyString(), anyList(), anyString())).thenReturn(Mono.just("ok"));

        AgentAdminController controller = new AgentAdminController(registry, llm, configurations);

        Map<String, Object> result =
                controller.test(
                        "draft-agent", new AgentAdminController.AgentTestRequest("hello", null));

        assertEquals("ok", result.get("response"));
        verify(llm)
                .complete(org.mockito.ArgumentMatchers.eq("draft prompt"), anyList(), anyString());
    }
}
