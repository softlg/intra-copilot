package com.intra.copilot.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Emits one correlated start/completion log pair for every API request. */
@Component
public class RequestLoggingFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI() == null || !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        request.setAttribute("requestId", requestId);
        response.setHeader("X-Request-Id", requestId);
        MDC.put("requestId", requestId);
        long started = System.nanoTime();
        String method = request.getMethod();
        String path = request.getRequestURI();
        log.debug("HTTP request started method={} path={}", method, path);
        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = (System.nanoTime() - started) / 1_000_000L;
            log.info(
                    "HTTP request completed method={} path={} status={} durationMs={}",
                    method,
                    path,
                    response.getStatus(),
                    durationMs);
            MDC.remove("requestId");
        }
    }

    private static String resolveRequestId(HttpServletRequest request) {
        String candidate = request.getHeader("X-Request-Id");
        if (candidate != null) {
            String normalized = candidate.strip();
            if (SAFE_REQUEST_ID.matcher(normalized).matches()) {
                return normalized;
            }
        }
        return "RQ-" + UUID.randomUUID().toString().replace("-", "");
    }
}
