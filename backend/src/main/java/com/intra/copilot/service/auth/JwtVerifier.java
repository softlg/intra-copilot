package com.intra.copilot.service.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.DeviceKey;
import com.intra.copilot.repo.DeviceKeyRepository;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.security.interfaces.RSAPublicKey;
import java.text.ParseException;
import java.time.Instant;
import java.util.Date;
import org.springframework.stereotype.Service;

/**
 * 验签设备用自身私钥签发的 JWT。
 * 验签通过后把 device_id -> (source, userId) 解析出来。
 */
@Service
public class JwtVerifier {

    private final DeviceKeyRepository deviceKeys;
    private final ObjectMapper mapper = new ObjectMapper();

    public JwtVerifier(DeviceKeyRepository deviceKeys) {
        this.deviceKeys = deviceKeys;
    }

    /** 验签失败或设备未注册时抛 IllegalArgumentException。 */
    public Verified verify(String token) {
        SignedJWT jwt;
        try {
            jwt = SignedJWT.parse(token);
        } catch (ParseException e) {
            throw new IllegalArgumentException("Malformed JWT");
        }

        String deviceId;
        String source;
        String scope;
        try {
            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            deviceId = claims.getSubject();
            source = (String) claims.getClaim("source");
            scope = (String) claims.getClaim("scope");
            if (deviceId == null || deviceId.isBlank() || source == null || source.isBlank()) {
                throw new IllegalArgumentException("Missing sub or source claim");
            }
            Date exp = claims.getExpirationTime();
            if (exp == null || exp.toInstant().isBefore(Instant.now())) {
                throw new IllegalArgumentException("Token expired");
            }
        } catch (ParseException e) {
            throw new IllegalArgumentException("Malformed claims");
        }

        DeviceKey device = deviceKeys.selectById(deviceId);
        if (device == null) {
            throw new IllegalArgumentException("Device not registered");
        }
        if (!device.getEnabled()) {
            throw new IllegalArgumentException("Device disabled");
        }
        if (!source.equals(device.getSource())) {
            throw new IllegalArgumentException("Source mismatch");
        }

        JWSVerifier verifier;
        try {
            JsonNode jwk = mapper.readTree(device.getPublicKeyJwk());
            RSAKey rsaKey = RSAKey.parse(jwk.toString());
            verifier = new RSASSAVerifier((RSAPublicKey) rsaKey.toRSAPublicKey());
        } catch (Exception e) {
            throw new IllegalArgumentException("Stored public key invalid: " + e.getMessage());
        }

        try {
            if (!jwt.verify(verifier)) {
                throw new IllegalArgumentException("Signature invalid");
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("Signature verification failed");
        }

        // 刷新 last_seen_at（异步或同步皆可；这里同步最简单）
        device.touch();
        deviceKeys.updateById(device);

        return new Verified(device.getSource(), device.getUserId(), scope);
    }

    public record Verified(String source, String userId, String scope) {}
}
