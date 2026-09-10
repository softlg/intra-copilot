package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;

import com.intra.copilot.service.auth.JwtVerifier;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class JwtAuthFilterTest {

    @Test
    void attachmentEndpointsRequireAuthentication() throws Exception {
        JwtAuthFilter filter = new JwtAuthFilter(mock(JwtVerifier.class));

        for (String path : List.of("/api/v1/attachments", "/api/v1/attachments/example-id")) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
            MockHttpServletResponse response = new MockHttpServletResponse();

            assertFalse(filter.preHandle(request, response, new Object()));
            assertEquals(401, response.getStatus());
        }
    }
}
