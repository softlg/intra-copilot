package com.intra.copilot.service.auth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Authenticates the single management-console account and issues short-lived, stateless session
 * tokens. Roles and fine-grained permissions are intentionally out of scope for this MVP.
 */
@Service
public class AdminAuthService {

    private static final String ISSUER = "intra-copilot-admin";
    private static final String SCOPE = "admin";

    private final String username;
    private final String password;
    private final Duration sessionTtl;
    private final MACSigner signer;
    private final MACVerifier verifier;

    public AdminAuthService(
            @Value("${admin.username:admin}") String username,
            @Value("${admin.password:}") String password,
            @Value("${admin.session-ttl-minutes:480}") long sessionTtlMinutes,
            @Value("${admin.session-secret:}") String sessionSecret) {
        this.username = username == null ? "" : username.trim();
        this.password = password == null ? "" : password;
        this.sessionTtl = Duration.ofMinutes(Math.max(1, sessionTtlMinutes));
        byte[] key = buildSigningKey(sessionSecret);
        try {
            this.signer = new MACSigner(key);
            this.verifier = new MACVerifier(key);
        } catch (JOSEException e) {
            throw new IllegalStateException("Unable to initialize admin session signing", e);
        }
    }

    public boolean isConfigured() {
        return !username.isBlank() && !password.isBlank();
    }

    public Optional<Session> authenticate(String candidateUsername, String candidatePassword) {
        if (!isConfigured()) {
            return Optional.empty();
        }
        String normalizedUsername = candidateUsername == null ? "" : candidateUsername.trim();
        String normalizedPassword = candidatePassword == null ? "" : candidatePassword;
        if (!secureEquals(username, normalizedUsername)
                || !secureEquals(password, normalizedPassword)) {
            return Optional.empty();
        }

        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(sessionTtl);
        JWTClaimsSet claims =
                new JWTClaimsSet.Builder()
                        .issuer(ISSUER)
                        .subject(username)
                        .issueTime(Date.from(issuedAt))
                        .expirationTime(Date.from(expiresAt))
                        .claim("scope", SCOPE)
                        .build();
        SignedJWT token =
                new SignedJWT(new com.nimbusds.jose.JWSHeader(JWSAlgorithm.HS256), claims);
        try {
            token.sign(signer);
        } catch (JOSEException e) {
            throw new IllegalStateException("Unable to sign admin session", e);
        }
        return Optional.of(new Session(token.serialize(), username, expiresAt));
    }

    /** Verifies an admin session token or throws {@link IllegalArgumentException}. */
    public Verified verify(String token) {
        SignedJWT jwt;
        try {
            jwt = SignedJWT.parse(token);
        } catch (ParseException e) {
            throw new IllegalArgumentException("Malformed admin token");
        }
        if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm())) {
            throw new IllegalArgumentException("Unsupported admin token algorithm");
        }

        try {
            if (!jwt.verify(verifier)) {
                throw new IllegalArgumentException("Admin token signature invalid");
            }
            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            String subject = claims.getSubject();
            Date expiresAt = claims.getExpirationTime();
            if (!ISSUER.equals(claims.getIssuer())
                    || !secureEquals(username, subject)
                    || !SCOPE.equals(claims.getStringClaim("scope"))
                    || expiresAt == null
                    || !expiresAt.toInstant().isAfter(Instant.now())) {
                throw new IllegalArgumentException("Admin token expired or invalid");
            }
            return new Verified(subject);
        } catch (ParseException | JOSEException e) {
            throw new IllegalArgumentException("Malformed admin token", e);
        }
    }

    private static byte[] buildSigningKey(String secret) {
        byte[] raw;
        if (secret == null || secret.isBlank()) {
            raw = new byte[32];
            new SecureRandom().nextBytes(raw);
        } else {
            raw = secret.getBytes(StandardCharsets.UTF_8);
        }
        try {
            return MessageDigest.getInstance("SHA-256").digest(raw);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private static boolean secureEquals(String expected, String candidate) {
        if (expected == null || candidate == null) {
            return false;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return MessageDigest.isEqual(
                    digest.digest(expected.getBytes(StandardCharsets.UTF_8)),
                    digest.digest(candidate.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    public record Session(String token, String username, Instant expiresAt) {}

    public record Verified(String username) {}
}
