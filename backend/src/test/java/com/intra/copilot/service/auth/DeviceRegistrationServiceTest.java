package com.intra.copilot.service.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.DeviceKey;
import com.intra.copilot.model.DeviceRegistrationChallenge;
import com.intra.copilot.repo.DeviceKeyRepository;
import com.intra.copilot.repo.DeviceRegistrationChallengeRepository;
import com.nimbusds.jose.jwk.RSAKey;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class DeviceRegistrationServiceTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void registersANewDeviceAfterVerifyingTheChallengeSignature() throws Exception {
        DeviceKeyRepository deviceKeys = mock(DeviceKeyRepository.class);
        DeviceRegistrationChallengeRepository challenges =
                mock(DeviceRegistrationChallengeRepository.class);
        AtomicReference<DeviceRegistrationChallenge> savedChallenge = new AtomicReference<>();
        doAnswer(
                        invocation -> {
                            savedChallenge.set(invocation.getArgument(0));
                            return 1;
                        })
                .when(challenges)
                .insert(any(DeviceRegistrationChallenge.class));
        when(challenges.findById(anyString()))
                .thenAnswer(invocation -> Optional.ofNullable(savedChallenge.get()));
        when(challenges.consume(anyString(), any())).thenReturn(true);

        DeviceRegistrationService service = new DeviceRegistrationService(deviceKeys, challenges);
        KeyPair keyPair = keyPair();
        JsonNode publicKey = publicJwk(keyPair);
        DeviceRegistrationService.Challenge challenge =
                service.challenge(null, "extension", publicKey);

        DeviceRegistrationService.RegisteredDevice registered =
                service.register(
                        new DeviceRegistrationService.RegisterRequest(
                                challenge.deviceId(),
                                publicKey,
                                "extension",
                                challenge.challengeId(),
                                sign(keyPair, canonical(challenge)),
                                null));

        assertEquals(challenge.deviceId(), registered.deviceId());
        assertEquals("registered", registered.status());
        verify(deviceKeys).insert(any(DeviceKey.class));
    }

    @Test
    void rejectsReplacingAnExistingPublicKeyWithoutProofFromTheOldKey() throws Exception {
        DeviceKeyRepository deviceKeys = mock(DeviceKeyRepository.class);
        DeviceRegistrationChallengeRepository challenges =
                mock(DeviceRegistrationChallengeRepository.class);
        KeyPair existingKeys = keyPair();
        KeyPair attackerKeys = keyPair();
        String deviceId = "11111111-1111-1111-1111-111111111111";

        DeviceKey existing = new DeviceKey();
        existing.setDeviceId(deviceId);
        existing.setSource("extension");
        existing.setUserId("anon-" + deviceId);
        existing.setEnabled(true);
        existing.setPublicKeyJwk(publicJwk(existingKeys));
        when(deviceKeys.selectById(deviceId)).thenReturn(existing);

        AtomicReference<DeviceRegistrationChallenge> savedChallenge = new AtomicReference<>();
        doAnswer(
                        invocation -> {
                            savedChallenge.set(invocation.getArgument(0));
                            return 1;
                        })
                .when(challenges)
                .insert(any(DeviceRegistrationChallenge.class));
        when(challenges.findById(anyString()))
                .thenAnswer(invocation -> Optional.ofNullable(savedChallenge.get()));
        when(challenges.consume(anyString(), any())).thenReturn(true);

        DeviceRegistrationService service = new DeviceRegistrationService(deviceKeys, challenges);
        JsonNode attackerPublicKey = publicJwk(attackerKeys);
        DeviceRegistrationService.Challenge challenge =
                service.challenge(deviceId, "extension", attackerPublicKey);

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () ->
                                service.register(
                                        new DeviceRegistrationService.RegisterRequest(
                                                deviceId,
                                                attackerPublicKey,
                                                "extension",
                                                challenge.challengeId(),
                                                sign(attackerKeys, canonical(challenge)),
                                                null)));

        assertEquals("轮换设备密钥必须由旧私钥签名", error.getMessage());
        verify(deviceKeys, never()).updateById(any(DeviceKey.class));
    }

    private static KeyPair keyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static JsonNode publicJwk(KeyPair pair) {
        RSAKey key = new RSAKey.Builder((RSAPublicKey) pair.getPublic()).build();
        return JSON.valueToTree(key.toJSONObject());
    }

    private static String canonical(DeviceRegistrationService.Challenge challenge) {
        return "intra-copilot-device-registration\n"
                + challenge.challengeId()
                + "\n"
                + challenge.nonce()
                + "\nextension\n"
                + challenge.deviceId();
    }

    private static String sign(KeyPair pair, String payload) throws Exception {
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(pair.getPrivate());
        signature.update(payload.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
    }
}
