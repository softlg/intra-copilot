package com.intra.copilot.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.intra.copilot.service.auth.AdminAuthService;
import com.intra.copilot.service.auth.AuthRateLimitService;
import com.intra.copilot.service.auth.DeviceRegistrationService;
import com.intra.copilot.service.auth.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 设备注册与身份相关接口。
 *
 * <ul>
 *   <li>POST /api/v1/auth/devices/register
 *   <li>POST /api/v1/auth/admin/login
 *   <li>GET /api/v1/auth/admin/session
 * </ul>
 *
 * <p>注册时由调用方提供 {@code deviceId + publicKeyJwk + source}；服务端用 {@code deviceId} 派生 {@code user_id}（格式
 * {@code anon-{deviceId}}）并落库设备公钥。
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final DeviceRegistrationService deviceRegistration;
    private final AdminAuthService adminAuth;
    private final AuthRateLimitService rateLimits;

    public AuthController(
            DeviceRegistrationService deviceRegistration,
            AdminAuthService adminAuth,
            AuthRateLimitService rateLimits) {
        this.deviceRegistration = deviceRegistration;
        this.adminAuth = adminAuth;
        this.rateLimits = rateLimits;
    }

    public record DeviceChallengeRequest(
            String deviceId,
            @NotNull JsonNode publicKeyJwk,
            @NotBlank String source) {}

    public record DeviceRegisterRequest(
            String deviceId,
            @NotNull JsonNode publicKeyJwk,
            @NotBlank String source,
            @NotBlank String challengeId,
            @NotBlank String signature,
            String previousKeySignature) {}

    public record AdminLoginRequest(
            @NotBlank String username, @NotBlank String password) {}

    public record AdminLoginResponse(String token, Instant expiresAt, Map<String, String> user) {}

    @PostMapping("/devices/challenge")
    public DeviceRegistrationService.Challenge challenge(
            @Valid @RequestBody DeviceChallengeRequest request,
            HttpServletRequest servletRequest) {
        if (request == null) throw new IllegalArgumentException("设备注册请求不能为空");
        requireRateLimit(
                "device-challenge-ip", clientIp(servletRequest), 60, Duration.ofMinutes(10));
        return deviceRegistration.challenge(
                request.deviceId(), request.source(), request.publicKeyJwk());
    }

    @PostMapping("/devices/register")
    public DeviceRegistrationService.RegisteredDevice register(
            @Valid @RequestBody DeviceRegisterRequest request,
            HttpServletRequest servletRequest) {
        if (request == null) throw new IllegalArgumentException("设备注册请求不能为空");
        requireRateLimit(
                "device-register-ip", clientIp(servletRequest), 60, Duration.ofMinutes(10));
        return deviceRegistration.register(
                new DeviceRegistrationService.RegisterRequest(
                        request.deviceId(),
                        request.publicKeyJwk(),
                        request.source(),
                        request.challengeId(),
                        request.signature(),
                        request.previousKeySignature()));
    }

    @PostMapping("/admin/login")
    public ResponseEntity<?> adminLogin(
            @Valid @RequestBody AdminLoginRequest req, HttpServletRequest servletRequest) {
        if (!adminAuth.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "管理员登录未配置，请设置 ADMIN_PASSWORD"));
        }
        if (req == null || req.username() == null || req.password() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "请输入用户名和密码"));
        }
        String username = req.username().trim().toLowerCase(Locale.ROOT);
        String ip = clientIp(servletRequest);
        AuthRateLimitService.Decision ipLimit =
                rateLimits.consume("admin-login-ip", ip, 30, Duration.ofMinutes(5));
        AuthRateLimitService.Decision userLimit =
                rateLimits.consume("admin-login-user", username, 10, Duration.ofMinutes(5));
        if (!ipLimit.allowed() || !userLimit.allowed()) {
            long retryAfter = Math.max(ipLimit.retryAfterSeconds(), userLimit.retryAfterSeconds());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(retryAfter))
                    .body(Map.of("error", "登录尝试过于频繁，请稍后重试"));
        }

        Optional<AdminAuthService.Session> session =
                adminAuth.authenticate(req.username(), req.password());
        if (session.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "用户名或密码错误"));
        }

        AdminAuthService.Session value = session.get();
        return ResponseEntity.ok(
                new AdminLoginResponse(
                        value.token(),
                        value.expiresAt(),
                        Map.of(
                                "id",
                                value.userId(),
                                "username",
                                value.username(),
                                "role",
                                value.role())));
    }

    @GetMapping("/admin/session")
    public Map<String, String> adminSession() {
        RequestContext.Identity identity = RequestContext.current();
        if (!"admin".equals(identity.source())) {
            throw new IllegalStateException("Not an admin session");
        }
        return Map.of("username", identity.actorLabel(), "role", identity.adminRole().name());
    }

    private void requireRateLimit(String scope, String identity, int limit, Duration window) {
        AuthRateLimitService.Decision decision = rateLimits.consume(scope, identity, limit, window);
        if (!decision.allowed()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "请求过于频繁，请 " + decision.retryAfterSeconds() + " 秒后重试");
        }
    }

    private static String clientIp(HttpServletRequest request) {
        if (request == null) return "unknown";
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }
}
