package com.intra.copilot.web;

import com.intra.copilot.service.auth.AdminAuthService;
import com.intra.copilot.service.auth.AdminRole;
import com.intra.copilot.service.auth.JwtVerifier;
import com.intra.copilot.service.auth.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 会话接口的 JWT 鉴权拦截器。 - 设备接口校验设备自签 JWT；管理端接口校验服务端签发的管理会话令牌 - 解析 Authorization: Bearer <jwt> - 验签后把身份写入
 * RequestContext - 请求结束清理 ThreadLocal
 */
@Component
public class JwtAuthFilter implements HandlerInterceptor {
    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilter.class);

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
            log.warn(
                    "Authentication rejected method={} path={} reason=missingBearerToken",
                    request.getMethod(),
                    request.getRequestURI());
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"MISSING_TOKEN\"}");
            return false;
        }

        String token = header.substring("Bearer ".length()).trim();
        try {
            if (mode == AuthMode.ADMIN) {
                AdminAuthService.Verified verified = adminAuth.verify(token);
                AdminRole role = AdminRole.parse(verified.role());
                if (!allowsAdminRequest(request, role)) {
                    log.warn(
                            "Authorization rejected userId={} username={} role={} method={} path={}",
                            verified.userId(),
                            verified.username(),
                            role,
                            request.getMethod(),
                            request.getRequestURI());
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write("{\"error\":\"FORBIDDEN\",\"message\":\"权限不足\"}");
                    return false;
                }
                RequestContext.set("admin", verified.userId(), verified.username(), role);
                log.debug(
                        "Admin request authenticated userId={} role={} method={} path={}",
                        verified.userId(),
                        role,
                        request.getMethod(),
                        request.getRequestURI());
            } else {
                JwtVerifier.Verified v = verifier.verify(token);
                RequestContext.set(v.source(), v.userId());
                log.debug(
                        "Device request authenticated source={} userId={} method={} path={}",
                        v.source(),
                        v.userId(),
                        request.getMethod(),
                        request.getRequestURI());
            }
            return true;
        } catch (IllegalArgumentException e) {
            log.warn(
                    "Authentication rejected method={} path={} reason={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    e.getMessage());
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
        if (path.equals("/api/v1/auth/devices/challenge")
                || path.equals("/api/v1/auth/devices/register")
                || path.equals("/api/v1/auth/admin/login")
                || path.equals("/api/v1/agents")
                || path.equals("/api/v1/capabilities")) {
            return AuthMode.NONE;
        }
        if (path.equals("/api/v1/auth/admin/session")
                || path.equals("/api/v1/admin")
                || path.startsWith("/api/v1/admin/")) {
            return AuthMode.ADMIN;
        }
        // Default deny for every current and future API route. Public endpoints
        // must be added to the explicit allowlist above.
        return AuthMode.DEVICE;
    }

    private boolean allowsAdminRequest(HttpServletRequest request, AdminRole role) {
        String path = request.getRequestURI();
        if (path == null) return false;
        if (path.equals("/api/v1/auth/admin/session")) return true;
        if (path.startsWith("/api/v1/admin/users")) {
            return role.atLeast(AdminRole.ADMIN);
        }
        if (path.startsWith("/api/v1/admin/mcp-servers")
                || path.startsWith("/api/v1/admin/tools")) {
            return HttpMethod.GET.matches(request.getMethod())
                    ? role.atLeast(AdminRole.VIEWER)
                    : role.atLeast(AdminRole.ADMIN);
        }
        if (HttpMethod.GET.matches(request.getMethod())) {
            return role.atLeast(AdminRole.VIEWER);
        }
        if (HttpMethod.DELETE.matches(request.getMethod())) {
            return role.atLeast(AdminRole.ADMIN);
        }
        return role.atLeast(AdminRole.EDITOR);
    }

    private enum AuthMode {
        NONE,
        DEVICE,
        ADMIN
    }
}
