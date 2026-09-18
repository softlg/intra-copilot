package com.intra.copilot.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

class ApiExceptionHandlerTest {

    @Test
    void exposesConflictReasonForLockedSystemResources() {
        ApiExceptionHandler handler = new ApiExceptionHandler();

        ResponseEntity<java.util.Map<String, String>> response =
                handler.status(
                        new ResponseStatusException(
                                HttpStatus.CONFLICT, "系统内置 Agent 随应用版本升级"));

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals(
                "系统内置 Agent 随应用版本升级",
                response.getBody().get("error"));
    }
}
