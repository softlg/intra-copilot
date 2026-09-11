package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.service.auth.AdminAuthService;
import com.intra.copilot.service.auth.JwtVerifier;
import com.intra.copilot.service.auth.RequestContext;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class JwtAuthFilterTest {

    @AfterEach
    void tearDown() {
        RequestContext.clear();
    }

    @Test
    void attachmentEndpointsRequireAuthentication() throws Exception {
        JwtAuthFilter filter =
                new JwtAuthFilter(mock(JwtVerifier.class), mock(AdminAuthService.class));

        for (String path : List.of("/api/v1/attachments", "/api/v1/attachments/example-id")) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
            MockHttpServletResponse response = new MockHttpServletResponse();

            assertFalse(filter.preHandle(request, response, new Object()));
            assertEquals(401, response.getStatus());
        }
    }

    @Test
    void adminEndpointsRequireAuthentication() throws Exception {
        JwtAuthFilter filter =
                new JwtAuthFilter(mock(JwtVerifier.class), mock(AdminAuthService.class));

        for (String path :
                List.of("/api/v1/admin", "/api/v1/admin/agents", "/api/v1/auth/admin/session")) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
            MockHttpServletResponse response = new MockHttpServletResponse();

            assertFalse(filter.preHandle(request, response, new Object()));
            assertEquals(401, response.getStatus());
        }
    }

    @Test
    void validAdminTokenBindsAdminIdentity() throws Exception {
        AdminAuthService adminAuth = mock(AdminAuthService.class);
        when(adminAuth.verify("admin-token")).thenReturn(new AdminAuthService.Verified("operator"));
        JwtAuthFilter filter = new JwtAuthFilter(mock(JwtVerifier.class), adminAuth);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/admin/agents");
        request.addHeader("Authorization", "Bearer admin-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(filter.preHandle(request, response, new Object()));
        assertEquals("admin", RequestContext.current().source());
        assertEquals("operator", RequestContext.current().userId());
    }
}
