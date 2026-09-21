package com.intra.copilot.application.identity;

import com.intra.copilot.domain.identity.AdminUser;
import com.intra.copilot.infrastructure.persistence.identity.AdminUserRepository;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Optional;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import com.intra.copilot.shared.identity.AdminRole;

/**
 * Authenticates management-console accounts and issues short-lived, stateless session tokens.
 *
 * <p>The first account is bootstrapped from the configured environment credentials. Additional
 * accounts are managed in the database. Resources remain global; the account id is used for audit
 * and private Copilot-session ownership.
 */
@Service
public class AdminAuthService {
    private static final Logger log = LoggerFactory.getLogger(AdminAuthService.class);

    private static final String ISSUER = "intra-copilot-admin";
    private static final String SCOPE = "admin";
    private static final int PASSWORD_ITERATIONS = 120_000;
    private static final int PASSWORD_KEY_BITS = 256;

    private final AdminUserRepository users;
    private final String bootstrapUsername;
    private final String bootstrapPassword;
    private final Duration sessionTtl;
    private final MACSigner signer;
    private final MACVerifier verifier;
    private final boolean strictConfiguration;

    @Autowired
    public AdminAuthService(
            AdminUserRepository users,
            @Value("${admin.username:admin}") String username,
            @Value("${admin.password:}") String password,
            @Value("${admin.session-ttl-minutes:480}") long sessionTtlMinutes,
            @Value("${admin.session-secret:}") String sessionSecret,
            @Value("${app.security.require-secure-admin-config:true}") boolean strictConfiguration) {
        this(
                users,
                username,
                password,
                sessionTtlMinutes,
                sessionSecret,
                true,
                strictConfiguration);
    }

    /** Constructor used by focused unit tests that do not need a database. */
    AdminAuthService(
            String username, String password, long sessionTtlMinutes, String sessionSecret) {
        this(null, username, password, sessionTtlMinutes, sessionSecret, false, false);
    }

    private AdminAuthService(
            AdminUserRepository users,
            String username,
            String password,
            long sessionTtlMinutes,
            String sessionSecret,
            boolean ignoredSpringOnlyMarker,
            boolean strictConfiguration) {
        this.users = users;
        this.bootstrapUsername = username == null ? "" : username.trim();
        this.bootstrapPassword = password == null ? "" : password;
        this.strictConfiguration = strictConfiguration;
        validateConfiguration(sessionSecret);
        this.sessionTtl = Duration.ofMinutes(Math.max(1, sessionTtlMinutes));
        byte[] key = buildSigningKey(sessionSecret);
        try {
            this.signer = new MACSigner(key);
            this.verifier = new MACVerifier(key);
        } catch (JOSEException e) {
            throw new IllegalStateException("Unable to initialize admin session signing", e);
        }
    }

    @PostConstruct
    void bootstrapOwner() {
        if (users == null
                || bootstrapUsername.isBlank()
                || bootstrapPassword.isBlank()
                || users.findByUsername(bootstrapUsername).isPresent()) {
            return;
        }
        AdminUser user = new AdminUser();
        user.setUsername(bootstrapUsername);
        user.setDisplayName(bootstrapUsername);
        user.setPasswordHash(hashPassword(bootstrapPassword));
        user.setEnabled(true);
        user.setRole(AdminRole.OWNER.name());
        users.save(user);
        log.info("Admin bootstrap owner created username={}", bootstrapUsername);
    }

    public boolean isConfigured() {
        if (!bootstrapUsername.isBlank() && !bootstrapPassword.isBlank()) return true;
        return users != null && !users.findAllOrdered().isEmpty();
    }

    public Optional<Session> authenticate(String candidateUsername, String candidatePassword) {
        String normalizedUsername = candidateUsername == null ? "" : candidateUsername.trim();
        String normalizedPassword = candidatePassword == null ? "" : candidatePassword;
        if (normalizedUsername.isBlank() || normalizedPassword.isEmpty() || users == null) {
            return legacyAuthenticate(normalizedUsername, normalizedPassword);
        }

        AdminUser user = users.findByUsername(normalizedUsername).orElse(null);
        if (user == null
                && secureEquals(bootstrapUsername, normalizedUsername)
                && secureEquals(bootstrapPassword, normalizedPassword)) {
            bootstrapOwner();
            user = users.findByUsername(normalizedUsername).orElse(null);
        }
        if (user == null || !user.isEnabled() || !verifyPassword(user, normalizedPassword)) {
            log.warn("Admin authentication failed username={}", normalizedUsername);
            return Optional.empty();
        }

        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(sessionTtl);
        user.setLastLoginAt(issuedAt);
        user.setSessionVersion(Math.max(0L, user.getSessionVersion()));
        user.touch();
        users.save(user);
        log.info(
                "Admin authentication succeeded userId={} username={} role={} expiresAt={}",
                user.getId(),
                user.getUsername(),
                user.getRole(),
                expiresAt);
        return Optional.of(
                issueSession(
                        user.getId(),
                        user.getUsername(),
                        user.getRole(),
                        user.getSessionVersion(),
                        expiresAt));
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
            String userId = claims.getSubject();
            String username = claims.getStringClaim("username");
            Long sessionVersion = claims.getLongClaim("sessionVersion");
            Date expiresAt = claims.getExpirationTime();
            if (!ISSUER.equals(claims.getIssuer())
                    || userId == null
                    || userId.isBlank()
                    || username == null
                    || username.isBlank()
                    || !SCOPE.equals(claims.getStringClaim("scope"))
                    || expiresAt == null
                    || !expiresAt.toInstant().isAfter(Instant.now())) {
                throw new IllegalArgumentException("Admin token expired or invalid");
            }
            if (users != null) {
                AdminUser current = users.selectById(userId);
                if (current == null
                        || !current.isEnabled()
                        || !current.getUsername().equals(username)) {
                    throw new IllegalArgumentException("Admin account disabled or changed");
                }
                if (sessionVersion == null) sessionVersion = 0L;
                if (current.getSessionVersion() != sessionVersion) {
                    throw new IllegalArgumentException("Admin session revoked");
                }
                log.debug(
                        "Admin token verified userId={} username={} role={}",
                        userId,
                        username,
                        current.getRole());
                return new Verified(userId, username, current.getRole());
            }
            return new Verified(userId, username, AdminRole.OWNER.name());
        } catch (ParseException | JOSEException e) {
            throw new IllegalArgumentException("Malformed admin token", e);
        }
    }

    public static String hashPassword(String password) {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        byte[] hash = pbkdf2(password.toCharArray(), salt, PASSWORD_ITERATIONS, PASSWORD_KEY_BITS);
        return "pbkdf2$"
                + PASSWORD_ITERATIONS
                + "$"
                + Base64.getEncoder().encodeToString(salt)
                + "$"
                + Base64.getEncoder().encodeToString(hash);
    }

    private Optional<Session> legacyAuthenticate(String username, String password) {
        if (bootstrapPassword.isBlank()) {
            return Optional.empty();
        }
        if (!secureEquals(bootstrapUsername, username)
                || !secureEquals(bootstrapPassword, password)) {
            return Optional.empty();
        }
        Instant expiresAt = Instant.now().plus(sessionTtl);
        return Optional.of(
                issueSession(
                        "legacy-admin",
                        bootstrapUsername,
                        AdminRole.OWNER.name(),
                        0L,
                        expiresAt));
    }

    private Session issueSession(
            String userId,
            String username,
            String role,
            long sessionVersion,
            Instant expiresAt) {
        Instant issuedAt = Instant.now();
        String effectiveRole = AdminRole.parse(role).name();
        JWTClaimsSet claims =
                new JWTClaimsSet.Builder()
                        .issuer(ISSUER)
                        .subject(userId)
                        .claim("username", username)
                        .claim("role", effectiveRole)
                        .claim("sessionVersion", sessionVersion)
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
        return new Session(token.serialize(), userId, username, effectiveRole, expiresAt);
    }

    private static boolean verifyPassword(AdminUser user, String candidate) {
        String encoded = user.getPasswordHash();
        if (encoded == null || encoded.isBlank()) return false;
        if (!encoded.startsWith("pbkdf2$")) {
            return secureEquals(encoded, candidate);
        }
        String[] parts = encoded.split("\\$");
        if (parts.length != 4) return false;
        try {
            int iterations = Integer.parseInt(parts[1]);
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            byte[] actual = pbkdf2(candidate.toCharArray(), salt, iterations, expected.length * 8);
            return MessageDigest.isEqual(expected, actual);
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static byte[] pbkdf2(char[] password, byte[] salt, int iterations, int bits) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, bits);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec)
                    .getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new IllegalStateException("PBKDF2 is unavailable", e);
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

    private void validateConfiguration(String sessionSecret) {
        if (!strictConfiguration) return;
        if (bootstrapUsername.isBlank()
                || bootstrapPassword.isBlank()
                || "admin".equalsIgnoreCase(bootstrapPassword)) {
            throw new IllegalStateException(
                    "ADMIN_USERNAME/ADMIN_PASSWORD 未安全配置；禁止使用空密码或默认密码 admin");
        }
        if (sessionSecret == null || sessionSecret.isBlank()) {
            throw new IllegalStateException("ADMIN_SESSION_SECRET 未配置，生产环境不允许使用临时随机密钥");
        }
    }

    public record Session(
            String token,
            String userId,
            String username,
            String role,
            Instant expiresAt) {
        public Session(String token, String userId, String username, Instant expiresAt) {
            this(token, userId, username, AdminRole.ADMIN.name(), expiresAt);
        }
    }

    public record Verified(String userId, String username, String role) {
        public Verified(String userId, String username) {
            this(userId, username, AdminRole.ADMIN.name());
        }
    }
}
