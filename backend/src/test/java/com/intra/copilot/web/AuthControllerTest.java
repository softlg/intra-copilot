package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.service.auth.AdminAuthService;
import com.intra.copilot.service.auth.AuthRateLimitService;
import com.intra.copilot.service.auth.DeviceRegistrationService;
import com.intra.copilot.service.auth.RequestContext;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class AuthControllerTest {

    @Test
    void adminLoginReturnsSessionForValidCredentials() {
        AdminAuthService adminAuth = mock(AdminAuthService.class);
        Instant expiresAt = Instant.now().plusSeconds(3600);
        when(adminAuth.isConfigured()).thenReturn(true);
        when(adminAuth.authenticate("admin", "secret"))
                .thenReturn(
                        Optional.of(
                                new AdminAuthService.Session(
                                        "signed-token", "admin-id", "admin", expiresAt)));
        AuthRateLimitService rateLimits = mock(AuthRateLimitService.class);
        when(rateLimits.consume(any(), any(), anyInt(), any()))
                .thenReturn(new AuthRateLimitService.Decision(true, 10, 0));
        AuthController controller =
                new AuthController(mock(DeviceRegistrationService.class), adminAuth, rateLimits);

        ResponseEntity<?> response =
                controller.adminLogin(
                        new AuthController.AdminLoginRequest("admin", "secret"),
                        new org.springframework.mock.web.MockHttpServletRequest());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        AuthController.AdminLoginResponse body =
                assertInstanceOf(AuthController.AdminLoginResponse.class, response.getBody());
        assertEquals("signed-token", body.token());
        assertEquals(expiresAt, body.expiresAt());
        assertEquals("admin-id", body.user().get("id"));
        assertEquals("admin", body.user().get("username"));
        assertEquals("ADMIN", body.user().get("role"));
    }

    @Test
    void adminLoginRejectsInvalidCredentials() {
        AdminAuthService adminAuth = mock(AdminAuthService.class);
        when(adminAuth.isConfigured()).thenReturn(true);
        when(adminAuth.authenticate("admin", "wrong")).thenReturn(Optional.empty());
        AuthRateLimitService rateLimits = mock(AuthRateLimitService.class);
        when(rateLimits.consume(any(), any(), anyInt(), any()))
                .thenReturn(new AuthRateLimitService.Decision(true, 10, 0));
        AuthController controller =
                new AuthController(mock(DeviceRegistrationService.class), adminAuth, rateLimits);

        ResponseEntity<?> response =
                controller.adminLogin(
                        new AuthController.AdminLoginRequest("admin", "wrong"),
                        new org.springframework.mock.web.MockHttpServletRequest());

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    @Test
    void adminSessionReturnsDisplayNameInsteadOfUserId() {
        AuthController controller =
                new AuthController(
                        mock(DeviceRegistrationService.class),
                        mock(AdminAuthService.class),
                        mock(AuthRateLimitService.class));
        RequestContext.set("admin", "admin-1", "operator");
        try {
            Map<String, String> session = controller.adminSession();

            assertEquals(Map.of("username", "operator", "role", "VIEWER"), session);
        } finally {
            RequestContext.clear();
        }
    }
}
