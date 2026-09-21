package com.intra.copilot.interfaces.rest.capability;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.application.capability.HookService;
import com.intra.copilot.domain.capability.HookDefinition;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HookAdminControllerTest {

    @Test
    void createForcesDraftState() {
        HookService service = mock(HookService.class);
        HookDefinition saved = new HookDefinition();
        saved.setId("hook-1");
        saved.setName("keyword");
        saved.setEnabled(false);
        when(service.create(any(HookDefinition.class), any())).thenReturn(saved);
        HookAdminController controller = new HookAdminController(service);
        HookDefinition request = new HookDefinition();
        request.setName("keyword");
        request.setEnabled(true);

        HookDefinition result = controller.create(request);

        assertSame(saved, result);
        assertFalse(request.isEnabled());
        verify(service).create(request, "anonymous");
    }

    @Test
    void updatePassesOptimisticVersionAndChangeNote() {
        HookService service = mock(HookService.class);
        HookDefinition saved = new HookDefinition();
        saved.setId("hook-1");
        when(service.update(
                        eq("hook-1"),
                        any(HookDefinition.class),
                        eq(7L),
                        eq("anonymous"),
                        eq("note")))
                .thenReturn(saved);
        HookAdminController controller = new HookAdminController(service);

        HookDefinition result = controller.update("hook-1", 7L, "note", new HookDefinition());

        assertSame(saved, result);
    }

    @Test
    void testBuildsEffectiveContext() {
        HookService service = mock(HookService.class);
        HookService.HookTestResult expected = new HookService.HookTestResult(true, List.of(), 1);
        when(service.test(any(HookDefinition.class), any(HookService.Context.class)))
                .thenReturn(expected);
        HookAdminController controller = new HookAdminController(service);
        HookAdminController.HookTestRequest request =
                new HookAdminController.HookTestRequest(
                        new HookDefinition(),
                        "hello",
                        "page",
                        false,
                        "agent",
                        "SUB",
                        "PRE_AGENT",
                        Map.of(),
                        0);

        HookService.HookTestResult result = controller.test(request);

        assertSame(expected, result);
        verify(service)
                .test(
                        any(HookDefinition.class),
                        org.mockito.ArgumentMatchers.argThat(
                                context ->
                                        !context.pageContextConsent()
                                                && context.effectivePageContext().isEmpty()
                                                && "agent".equals(context.agentId())));
    }
}
