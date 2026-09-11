package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.repo.DeviceKeyRepository;
import com.intra.copilot.service.auth.AdminAuthService;
import java.time.Instant;
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
                                new AdminAuthService.Session("signed-token", "admin", expiresAt)));
        AuthController controller = new AuthController(mock(DeviceKeyRepository.class), adminAuth);

        ResponseEntity<?> response =
                controller.adminLogin(new AuthController.AdminLoginRequest("admin", "secret"));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        AuthController.AdminLoginResponse body =
                assertInstanceOf(AuthController.AdminLoginResponse.class, response.getBody());
        assertEquals("signed-token", body.token());
        assertEquals(expiresAt, body.expiresAt());
        assertEquals("admin", body.user().get("username"));
    }

    @Test
    void adminLoginRejectsInvalidCredentials() {
        AdminAuthService adminAuth = mock(AdminAuthService.class);
        when(adminAuth.isConfigured()).thenReturn(true);
        when(adminAuth.authenticate("admin", "wrong")).thenReturn(Optional.empty());
        AuthController controller = new AuthController(mock(DeviceKeyRepository.class), adminAuth);

        ResponseEntity<?> response =
                controller.adminLogin(new AuthController.AdminLoginRequest("admin", "wrong"));

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }
}
