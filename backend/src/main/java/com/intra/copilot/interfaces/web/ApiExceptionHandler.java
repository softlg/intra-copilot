package com.intra.copilot.interfaces.web;

import jakarta.validation.ConstraintViolationException;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> badRequest(IllegalArgumentException e) {
        return Map.of(
                "error",
                e.getMessage() == null ? "请求参数无效" : e.getMessage(),
                "code",
                "VALIDATION_ERROR");
    }

    @ExceptionHandler(NoSuchElementException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, Object> notFound(NoSuchElementException e) {
        return Map.of(
                "error", e.getMessage() == null ? "资源不存在" : e.getMessage(), "code", "NOT_FOUND");
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> status(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode())
                .body(
                        Map.of(
                                "error",
                                e.getReason() == null || e.getReason().isBlank()
                                        ? "请求失败"
                                        : e.getReason(),
                                "code",
                                e.getStatusCode().value() == 409 ? "CONFLICT" : "REQUEST_FAILED"));
    }

    @ExceptionHandler(RejectedExecutionException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public Map<String, Object> overloaded(RejectedExecutionException e) {
        return Map.of("error", "当前请求较多，请稍后重试", "code", "STREAM_CAPACITY_EXCEEDED");
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Map<String, Object> internal(Exception e) {
        LOG.error("Unhandled API exception", e);
        return Map.of("error", "服务器内部异常，请稍后重试", "code", "INTERNAL_ERROR");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> validation(MethodArgumentNotValidException e) {
        Map<String, String> fields =
                e.getBindingResult()
                        .getFieldErrors()
                        .stream()
                        .collect(
                                java.util.stream.Collectors.toMap(
                                        error -> error.getField(),
                                        error ->
                                                error.getDefaultMessage() == null
                                                        ? "参数无效"
                                                        : error.getDefaultMessage(),
                                        (first, ignored) -> first,
                                        java.util.LinkedHashMap::new));
        return Map.of("error", "请求参数校验失败", "code", "VALIDATION_ERROR", "fieldErrors", fields);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> constraint(ConstraintViolationException e) {
        return Map.of("error", "请求参数校验失败", "code", "VALIDATION_ERROR");
    }
}
