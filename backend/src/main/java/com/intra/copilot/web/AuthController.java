package com.intra.copilot.web;

import com.intra.copilot.model.DeviceKey;
import com.intra.copilot.repo.DeviceKeyRepository;
import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 设备注册与身份相关接口。
 * - POST /api/v1/auth/devices/register
 *
 * 注册时由调用方提供 deviceId + publicKeyJwk + source；
 * 服务端用 deviceId 派生 user_id（格式 anon-{deviceId}），落库设备公钥。
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final DeviceKeyRepository deviceKeys;

    public AuthController(DeviceKeyRepository deviceKeys) {
        this.deviceKeys = deviceKeys;
    }

    public record DeviceRegisterRequest(
            String deviceId,
            Object publicKeyJwk,
            String source) {}

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
            existing.setPublicKeyJwk(req.publicKeyJwk().toString());
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
        device.setPublicKeyJwk(req.publicKeyJwk().toString());
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
}
