package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.service.AdminCopilotService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AdminCopilotControllerTest {

    @Test
    void renameDelegatesToOwnedSession() {
        AdminCopilotService service = mock(AdminCopilotService.class);
        Map<String, Object> expected = Map.of("id", "session-1", "title", "New title");
        when(service.renameSession("session-1", "New title")).thenReturn(expected);
        AdminCopilotController controller = new AdminCopilotController(service);

        Map<String, Object> result =
                controller.rename(
                        "session-1",
                        new AdminCopilotController.RenameSessionRequest("New title"));

        assertEquals(expected, result);
        verify(service).renameSession("session-1", "New title");
    }

    @Test
    void deleteDelegatesSelectedSessionIds() {
        AdminCopilotService service = mock(AdminCopilotService.class);
        Map<String, Object> expected = Map.of("requested", 2, "deleted", 2);
        when(service.deleteSessions(List.of("session-1", "session-2"))).thenReturn(expected);
        AdminCopilotController controller = new AdminCopilotController(service);

        Map<String, Object> result =
                controller.delete(
                        new AdminCopilotController.DeleteSessionsRequest(
                                List.of("session-1", "session-2")));

        assertEquals(expected, result);
        verify(service).deleteSessions(List.of("session-1", "session-2"));
    }
}
