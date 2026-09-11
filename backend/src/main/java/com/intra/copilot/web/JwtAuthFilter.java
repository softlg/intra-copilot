package com.intra.copilot.web;

import com.intra.copilot.service.auth.AdminAuthService;
import com.intra.copilot.service.auth.JwtVerifier;
import com.intra.copilot.service.auth.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 会话接口的 JWT 鉴权拦截器。 - 设备接口校验设备自签 JWT；管理端接口校验服务端签发的管理会话令牌 - 解析 Authorization: Bearer <jwt> - 验签后把身份写入
 * RequestContext - 请求结束清理 ThreadLocal
 */
@Component
public class JwtAuthFilter implements HandlerInterceptor {

    private final JwtVerifier verifier;
    private final AdminAuthService adminAuth;

    public JwtAuthFilter(JwtVerifier verifier, AdminAuthService adminAuth) {
        this.verifier = verifier;
        this.adminAuth = adminAuth;
    }

    @Override
    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        // 仅对受保护 path 强制鉴权
        AuthMode mode = authMode(request);
        if (mode == AuthMode.NONE) {
            return true;
        }
        // 预检请求直接放行
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }

        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"MISSING_TOKEN\"}");
            return false;
        }

        String token = header.substring("Bearer ".length()).trim();
        try {
            if (mode == AuthMode.ADMIN) {
                AdminAuthService.Verified verified = adminAuth.verify(token);
                RequestContext.set("admin", verified.username());
            } else {
                JwtVerifier.Verified v = verifier.verify(token);
                RequestContext.set(v.source(), v.userId());
            }
            return true;
        } catch (IllegalArgumentException e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter()
                    .write(
                            "{\"error\":\"INVALID_TOKEN\",\"message\":\""
                                    + e.getMessage().replace("\"", "'")
                                    + "\"}");
            return false;
        }
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception ex) {
        RequestContext.clear();
    }

    private AuthMode authMode(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) return AuthMode.NONE;
        if (path.equals("/api/v1/auth/admin/session")
                || path.equals("/api/v1/admin")
                || path.startsWith("/api/v1/admin/")) {
            return AuthMode.ADMIN;
        }
        if (path.startsWith("/api/v1/sessions")
                || path.startsWith("/api/v1/chat/")
                || path.startsWith("/api/v1/attachments")
                || path.startsWith("/api/v1/feedback")) {
            return AuthMode.DEVICE;
        }
        return AuthMode.NONE;
    }

    private enum AuthMode {
        NONE,
        DEVICE,
        ADMIN
    }
}
