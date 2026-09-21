package com.intra.copilot.application.identity;

import com.fasterxml.jackson.databind.JsonNode;
import com.intra.copilot.domain.identity.DeviceKey;
import com.intra.copilot.domain.identity.DeviceRegistrationChallenge;
import com.intra.copilot.infrastructure.persistence.identity.DeviceKeyRepository;
import com.intra.copilot.infrastructure.persistence.identity.DeviceRegistrationChallengeRepository;
import com.nimbusds.jose.jwk.RSAKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Challenge-response device registration and key rotation. */
@Service
public class DeviceRegistrationService {
    private static final Logger log = LoggerFactory.getLogger(DeviceRegistrationService.class);
    private static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);
    private static final Pattern SOURCE_PATTERN = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final DeviceKeyRepository deviceKeys;
    private final DeviceRegistrationChallengeRepository challenges;

    public DeviceRegistrationService(
            DeviceKeyRepository deviceKeys, DeviceRegistrationChallengeRepository challenges) {
        this.deviceKeys = deviceKeys;
        this.challenges = challenges;
    }

    public Challenge challenge(String requestedDeviceId, String source, JsonNode publicKeyJwk) {
        String normalizedSource = normalizeSource(source);
        validatePublicKey(publicKeyJwk);
        String deviceId =
                requestedDeviceId == null || requestedDeviceId.isBlank()
                        ? UUID.randomUUID().toString()
                        : validateDeviceId(requestedDeviceId);

        DeviceKey existing = deviceKeys.selectById(deviceId);
        if (existing != null && !normalizedSource.equals(existing.getSource())) {
            throw new IllegalArgumentException("设备来源不匹配");
        }

        DeviceRegistrationChallenge challenge = new DeviceRegistrationChallenge();
        challenge.setDeviceId(deviceId);
        challenge.setSource(normalizedSource);
        challenge.setNonce(randomToken(32));
        challenge.setPurpose(existing == null ? "REGISTER" : "ROTATE");
        challenge.setExpiresAt(Instant.now().plus(CHALLENGE_TTL));
        challenges.insert(challenge);
        log.info(
                "Device registration challenge issued deviceId={} source={} purpose={}",
                deviceId,
                normalizedSource,
                challenge.getPurpose());
        return new Challenge(
                challenge.getDeviceId(),
                challenge.getChallengeId(),
                challenge.getNonce(),
                challenge.getExpiresAt());
    }

    @Transactional
    public RegisteredDevice register(RegisterRequest request) {
        if (request == null) throw new IllegalArgumentException("设备注册请求不能为空");
        String deviceId = validateDeviceId(request.deviceId());
        String source = normalizeSource(request.source());
        validatePublicKey(request.publicKeyJwk());
        if (request.challengeId() == null
                || request.challengeId().isBlank()
                || request.signature() == null
                || request.signature().isBlank()) {
            throw new IllegalArgumentException("challengeId 和 signature 不能为空");
        }

        DeviceRegistrationChallenge challenge =
                challenges
                        .findById(request.challengeId().trim())
                        .orElseThrow(() -> new IllegalArgumentException("注册挑战不存在或已过期"));
        Instant now = Instant.now();
        if (challenge.getConsumedAt() != null || !challenge.getExpiresAt().isAfter(now)) {
            throw new IllegalArgumentException("注册挑战不存在或已过期");
        }
        if (!deviceId.equals(challenge.getDeviceId()) || !source.equals(challenge.getSource())) {
            throw new IllegalArgumentException("注册挑战与设备信息不匹配");
        }
        if (!challenges.consume(challenge.getChallengeId(), now)) {
            throw new IllegalArgumentException("注册挑战已被使用");
        }

        String canonical = canonicalPayload(challenge, deviceId, source);
        if (!verifySignature(request.publicKeyJwk(), canonical, request.signature())) {
            throw new IllegalArgumentException("设备签名验证失败");
        }

        DeviceKey existing = deviceKeys.selectById(deviceId);
        if (existing != null) {
            if (!Boolean.TRUE.equals(existing.getEnabled())) {
                throw new IllegalArgumentException("设备已被禁用");
            }
            if (!sameKey(existing.getPublicKeyJwk(), request.publicKeyJwk())) {
                if (request.previousKeySignature() == null
                        || request.previousKeySignature().isBlank()
                        || !verifySignature(
                                existing.getPublicKeyJwk(),
                                canonical,
                                request.previousKeySignature())) {
                    throw new IllegalArgumentException("轮换设备密钥必须由旧私钥签名");
                }
                existing.setPublicKeyJwk(request.publicKeyJwk().deepCopy());
            }
            existing.setLastSeenAt(now);
            deviceKeys.updateById(existing);
            log.info(
                    "Device registration completed deviceId={} source={} userId={} status=updated",
                    existing.getDeviceId(),
                    existing.getSource(),
                    existing.getUserId());
            return new RegisteredDevice(
                    existing.getDeviceId(), existing.getSource(), existing.getUserId(), "updated");
        }

        DeviceKey device = new DeviceKey();
        device.setDeviceId(deviceId);
        device.setPublicKeyJwk(request.publicKeyJwk().deepCopy());
        device.setSource(source);
        device.setUserId("anon-" + deviceId);
        device.setEnabled(true);
        device.setCreatedAt(now);
        device.setLastSeenAt(now);
        deviceKeys.insert(device);
        log.info(
                "Device registration completed deviceId={} source={} userId={} status=registered",
                device.getDeviceId(),
                device.getSource(),
                device.getUserId());
        return new RegisteredDevice(deviceId, source, device.getUserId(), "registered");
    }

    @Scheduled(cron = "${auth.device-challenge-cleanup-cron:0 5 * * * *}")
    public void cleanupExpiredChallenges() {
        challenges.deleteExpired(Instant.now().minus(Duration.ofHours(1)));
    }

    private static String canonicalPayload(
            DeviceRegistrationChallenge challenge, String deviceId, String source) {
        return "intra-copilot-device-registration\n"
                + challenge.getChallengeId()
                + "\n"
                + challenge.getNonce()
                + "\n"
                + source
                + "\n"
                + deviceId;
    }

    private static boolean verifySignature(
            JsonNode publicKeyJwk, String payload, String signature) {
        try {
            RSAKey key = RSAKey.parse(publicKeyJwk.toString());
            byte[] signed = Base64.getUrlDecoder().decode(signature.trim());
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify((RSAPublicKey) key.toRSAPublicKey());
            verifier.update(payload.getBytes(StandardCharsets.UTF_8));
            return verifier.verify(signed);
        } catch (Exception error) {
            return false;
        }
    }

    private static boolean sameKey(JsonNode left, JsonNode right) {
        if (left == null || right == null) return false;
        try {
            return RSAKey.parse(left.toString())
                    .computeThumbprint()
                    .toString()
                    .equals(RSAKey.parse(right.toString()).computeThumbprint().toString());
        } catch (Exception error) {
            return false;
        }
    }

    private static void validatePublicKey(JsonNode publicKeyJwk) {
        if (publicKeyJwk == null || !publicKeyJwk.isObject()) {
            throw new IllegalArgumentException("publicKeyJwk 不能为空");
        }
        try {
            RSAKey key = RSAKey.parse(publicKeyJwk.toString());
            RSAPublicKey publicKey = (RSAPublicKey) key.toRSAPublicKey();
            if (publicKey.getModulus().bitLength() < 2048) {
                throw new IllegalArgumentException("RSA 公钥长度不能低于 2048 位");
            }
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("publicKeyJwk 不是有效 RSA 公钥");
        }
    }

    private static String normalizeSource(String value) {
        String source = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!SOURCE_PATTERN.matcher(source).matches()) {
            throw new IllegalArgumentException("设备来源格式无效");
        }
        return source;
    }

    private static String validateDeviceId(String value) {
        String deviceId = value == null ? "" : value.trim();
        if (!deviceId.matches("[A-Za-z0-9_-]{8,64}")) {
            throw new IllegalArgumentException("deviceId 格式无效");
        }
        return deviceId;
    }

    private static String randomToken(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    public record Challenge(String deviceId, String challengeId, String nonce, Instant expiresAt) {}

    public record RegisterRequest(
            String deviceId,
            JsonNode publicKeyJwk,
            String source,
            String challengeId,
            String signature,
            String previousKeySignature) {}

    public record RegisteredDevice(String deviceId, String source, String userId, String status) {}
}
