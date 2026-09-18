package com.intra.copilot.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.intra.copilot.service.auth.AdminAuthService;
import com.intra.copilot.service.auth.DeviceRegistrationService;
import com.intra.copilot.service.auth.RequestContext;
import java.time.Instant;
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

    public AuthController(
            DeviceRegistrationService deviceRegistration, AdminAuthService adminAuth) {
        this.deviceRegistration = deviceRegistration;
        this.adminAuth = adminAuth;
    }

    public record DeviceChallengeRequest(String deviceId, JsonNode publicKeyJwk, String source) {}

    public record DeviceRegisterRequest(
            String deviceId,
            JsonNode publicKeyJwk,
            String source,
            String challengeId,
            String signature,
            String previousKeySignature) {}

    public record AdminLoginRequest(String username, String password) {}

    public record AdminLoginResponse(String token, Instant expiresAt, Map<String, String> user) {}

    @PostMapping("/devices/challenge")
    public DeviceRegistrationService.Challenge challenge(
            @RequestBody DeviceChallengeRequest request) {
        if (request == null) throw new IllegalArgumentException("设备注册请求不能为空");
        return deviceRegistration.challenge(
                request.deviceId(), request.source(), request.publicKeyJwk());
    }

    @PostMapping("/devices/register")
    public DeviceRegistrationService.RegisteredDevice register(
            @RequestBody DeviceRegisterRequest request) {
        if (request == null) throw new IllegalArgumentException("设备注册请求不能为空");
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
    public ResponseEntity<?> adminLogin(@RequestBody AdminLoginRequest req) {
        if (!adminAuth.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "管理员登录未配置，请设置 ADMIN_PASSWORD"));
        }
        if (req == null || req.username() == null || req.password() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "请输入用户名和密码"));
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
}
