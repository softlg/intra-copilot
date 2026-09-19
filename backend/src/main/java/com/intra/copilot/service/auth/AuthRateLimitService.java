package com.intra.copilot.service.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Database-backed fixed-window rate limiting shared by all backend instances. */
@Service
public class AuthRateLimitService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public AuthRateLimitService(
            JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public Decision consume(String scope, String identity, int limit, Duration window) {
        String key = hash(scope + "\n" + identity);
        Duration block = window;
        return transaction.execute(
                status -> {
                    List<Row> rows =
                            jdbc.query(
                                    """
                                    SELECT window_start, attempts, blocked_until
                                    FROM auth_rate_limit
                                    WHERE bucket_key = ?
                                    FOR UPDATE
                                    """,
                                    (rs, index) ->
                                            new Row(
                                                    rs.getTimestamp("window_start").toInstant(),
                                                    rs.getInt("attempts"),
                                                    rs.getTimestamp("blocked_until") == null
                                                            ? null
                                                            : rs.getTimestamp("blocked_until")
                                                                    .toInstant()),
                                    key);
                    Instant now = Instant.now();
                    Row current =
                            rows.isEmpty()
                                    ? new Row(now, 0, null)
                                    : rows.get(0);
                    if (current.blockedUntil() != null
                            && current.blockedUntil().isAfter(now)) {
                        return denied(current.blockedUntil(), now);
                    }
                    Instant windowStart =
                            current.windowStart().plus(window).isBefore(now)
                                    ? now
                                    : current.windowStart();
                    int attempts =
                            current.windowStart().plus(window).isBefore(now)
                                    ? 1
                                    : current.attempts() + 1;
                    Instant blockedUntil = attempts >= limit ? now.plus(block) : null;
                    jdbc.update(
                            """
                            INSERT INTO auth_rate_limit(
                              bucket_key, window_start, attempts, blocked_until, updated_at)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT (bucket_key) DO UPDATE SET
                              window_start = EXCLUDED.window_start,
                              attempts = EXCLUDED.attempts,
                              blocked_until = EXCLUDED.blocked_until,
                              updated_at = EXCLUDED.updated_at
                            """,
                            key,
                            Timestamp.from(windowStart),
                            attempts,
                            blockedUntil == null ? null : Timestamp.from(blockedUntil),
                            Timestamp.from(now));
                    return blockedUntil == null
                            ? new Decision(true, Math.max(0, limit - attempts), 0)
                            : denied(blockedUntil, now);
                });
    }

    private static Decision denied(Instant blockedUntil, Instant now) {
        return new Decision(
                false,
                0,
                Math.max(1L, Duration.between(now, blockedUntil).toSeconds()));
    }

    private static String hash(String value) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception error) {
            throw new IllegalStateException("无法计算限流键", error);
        }
    }

    private record Row(Instant windowStart, int attempts, Instant blockedUntil) {}

    public record Decision(boolean allowed, int remaining, long retryAfterSeconds) {}
}
