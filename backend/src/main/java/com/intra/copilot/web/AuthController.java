package com.intra.copilot.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.intra.copilot.model.DeviceKey;
import com.intra.copilot.repo.DeviceKeyRepository;
import com.intra.copilot.service.auth.AdminAuthService;
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

    private final DeviceKeyRepository deviceKeys;
    private final AdminAuthService adminAuth;

    public AuthController(DeviceKeyRepository deviceKeys, AdminAuthService adminAuth) {
        this.deviceKeys = deviceKeys;
        this.adminAuth = adminAuth;
    }

    public record DeviceRegisterRequest(String deviceId, JsonNode publicKeyJwk, String source) {}

    public record AdminLoginRequest(String username, String password) {}

    public record AdminLoginResponse(String token, Instant expiresAt, Map<String, String> user) {}

    @PostMapping("/devices/register")
    public Map<String, Object> register(@RequestBody DeviceRegisterRequest req) {
        if (req == null
                || req.deviceId() == null
                || req.deviceId().isBlank()
                || req.publicKeyJwk() == null
                || req.source() == null
                || req.source().isBlank()) {
            throw new IllegalArgumentException("deviceId, publicKeyJwk, source are required");
        }

        DeviceKey existing = deviceKeys.selectById(req.deviceId());
        if (existing != null) {
            // 已注册：刷新公钥（如设备重装），保持 user_id
            existing.setPublicKeyJwk(req.publicKeyJwk());
            existing.setLastSeenAt(Instant.now());
            existing.setEnabled(true);
            deviceKeys.updateById(existing);
            return Map.of(
                    "deviceId", existing.getDeviceId(),
                    "source", existing.getSource(),
                    "userId", existing.getUserId(),
                    "status", "updated");
        }

        DeviceKey device = new DeviceKey();
        device.setDeviceId(req.deviceId());
        device.setPublicKeyJwk(req.publicKeyJwk());
        device.setSource(req.source());
        device.setUserId("anon-" + req.deviceId());
        device.setEnabled(true);
        device.setCreatedAt(Instant.now());
        device.setLastSeenAt(Instant.now());
        deviceKeys.insert(device);

        return Map.of(
                "deviceId", device.getDeviceId(),
                "source", device.getSource(),
                "userId", device.getUserId(),
                "status", "registered");
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
                        value.token(), value.expiresAt(), Map.of("username", value.username())));
    }

    @GetMapping("/admin/session")
    public Map<String, String> adminSession() {
        RequestContext.Identity identity = RequestContext.current();
        if (!"admin".equals(identity.source())) {
            throw new IllegalStateException("Not an admin session");
        }
        return Map.of("username", identity.userId());
    }
}
