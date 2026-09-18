package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.intra.copilot.service.AdminCopilotService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class AdminCopilotControllerTest {

    @Test
    void renameDelegatesToOwnedSession() {
        AdminCopilotService service = mock(AdminCopilotService.class);
        Map<String, Object> expected = Map.of("id", "session-1", "title", "New title");
        when(service.updateSession("session-1", "New title", null)).thenReturn(expected);
        AdminCopilotController controller = new AdminCopilotController(service);

        Map<String, Object> result =
                controller.rename(
                        "session-1",
                        new AdminCopilotController.RenameSessionRequest("New title"));

        assertEquals(expected, result);
        verify(service).updateSession("session-1", "New title", null);
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

    @Test
    void updateStateDelegatesValidationWorkspace() {
        AdminCopilotService service = mock(AdminCopilotService.class);
        Map<String, Object> state = Map.of("section", "cases");
        Map<String, Object> expected =
                Map.of("id", "session-1", "state", state);
        when(service.updateSessionState("session-1", state)).thenReturn(expected);
        AdminCopilotController controller = new AdminCopilotController(service);

        Map<String, Object> result =
                controller.updateState(
                        "session-1",
                        new AdminCopilotController.UpdateSessionStateRequest(state));

        assertEquals(expected, result);
        verify(service).updateSessionState("session-1", state);
    }

    @Test
    void deleteEndpointAcceptsPostRequest() throws Exception {
        AdminCopilotService service = mock(AdminCopilotService.class);
        when(service.deleteSessions(List.of("session-1", "session-2")))
                .thenReturn(Map.of("requested", 2, "deleted", 2));
        MockMvc mockMvc =
                MockMvcBuilders.standaloneSetup(new AdminCopilotController(service)).build();

        mockMvc.perform(
                        post("/api/v1/admin/copilot/sessions/delete")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {"ids":["session-1","session-2"]}
                                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requested").value(2))
                .andExpect(jsonPath("$.deleted").value(2));

        verify(service).deleteSessions(List.of("session-1", "session-2"));
    }
}
