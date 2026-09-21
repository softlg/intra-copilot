package com.intra.copilot.application.identity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.domain.identity.AdminUser;
import com.intra.copilot.infrastructure.persistence.identity.AdminUserRepository;
import java.util.Optional;
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
        assertEquals("legacy-admin", service.verify(session.token()).userId());
    }

    @Test
    void rejectsWrongCredentialsAndTamperedToken() {
        AdminAuthService service =
                new AdminAuthService("admin", "secret", 60, "test-session-secret");

        assertTrue(service.authenticate("admin", "wrong").isEmpty());
        assertTrue(service.authenticate("other", "secret").isEmpty());

        String token = service.authenticate("admin", "secret").orElseThrow().token();
        int signatureIndex = token.lastIndexOf('.') + 2;
        char replacement = token.charAt(signatureIndex) == 'a' ? 'b' : 'a';
        String tampered =
                token.substring(0, signatureIndex)
                        + replacement
                        + token.substring(signatureIndex + 1);
        assertThrows(IllegalArgumentException.class, () -> service.verify(tampered));
    }

    @Test
    void rejectsTokenWhenDatabaseAccountWasDeleted() {
        AdminUserRepository users = mock(AdminUserRepository.class);
        AdminUser user = new AdminUser();
        user.setId("admin-1");
        user.setUsername("operator");
        user.setDisplayName("Operator");
        user.setPasswordHash(AdminAuthService.hashPassword("secret"));
        user.setEnabled(true);
        when(users.findByUsername("operator")).thenReturn(Optional.of(user));

        AdminAuthService service =
                new AdminAuthService(users, "admin", "", 60, "test-session-secret", false);
        AdminAuthService.Session session = service.authenticate("operator", "secret").orElseThrow();

        when(users.selectById("admin-1")).thenReturn(null);

        assertThrows(IllegalArgumentException.class, () -> service.verify(session.token()));
    }

    @Test
    void loginIsDisabledWhenPasswordIsNotConfigured() {
        AdminAuthService service = new AdminAuthService("admin", "", 60, "");

        assertFalse(service.isConfigured());
        assertTrue(service.authenticate("admin", "").isEmpty());
    }

    @Test
    void strictConfigurationRejectsDefaultPasswordAndEphemeralSecret() {
        assertThrows(
                IllegalStateException.class,
                () -> new AdminAuthService(null, "admin", "admin", 60, "secret", true));
        assertThrows(
                IllegalStateException.class,
                () -> new AdminAuthService(null, "admin", "strong-password", 60, "", true));
    }
}
