package com.intra.copilot.service.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class AdminAuthServiceTest {

    @Test
    void authenticatesConfiguredAccountAndVerifiesIssuedToken() {
        AdminAuthService service =
                new AdminAuthService(" admin ", "secret", 60, "test-session-secret");

        assertTrue(service.isConfigured());
        AdminAuthService.Session session = service.authenticate(" admin ", "secret").orElseThrow();

        assertEquals("admin", session.username());
        assertEquals("admin", service.verify(session.token()).username());
    }

    @Test
    void rejectsWrongCredentialsAndTamperedToken() {
        AdminAuthService service =
                new AdminAuthService("admin", "secret", 60, "test-session-secret");

        assertTrue(service.authenticate("admin", "wrong").isEmpty());
        assertTrue(service.authenticate("other", "secret").isEmpty());

        String token = service.authenticate("admin", "secret").orElseThrow().token();
        char replacement = token.charAt(token.length() - 1) == 'a' ? 'b' : 'a';
        String tampered = token.substring(0, token.length() - 1) + replacement;
        assertThrows(IllegalArgumentException.class, () -> service.verify(tampered));
    }

    @Test
    void loginIsDisabledWhenPasswordIsNotConfigured() {
        AdminAuthService service = new AdminAuthService("admin", "", 60, "");

        assertFalse(service.isConfigured());
        assertTrue(service.authenticate("admin", "").isEmpty());
    }
}
