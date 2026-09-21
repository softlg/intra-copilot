package com.intra.copilot.infrastructure.conversation;

import java.time.Duration;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Short-lived database lease used to serialize work for one conversation. */
@Service
public class RuntimeLockService {
    private final JdbcTemplate jdbc;

    public RuntimeLockService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean tryAcquire(String key, String ownerId, Duration ttl) {
        Instant expiresAt = Instant.now().plus(ttl);
        int updated =
                jdbc.update(
                        """
                        INSERT INTO runtime_lock(lock_key, owner_id, expires_at, updated_at)
                        VALUES (?, ?, ?, NOW())
                        ON CONFLICT (lock_key) DO UPDATE SET
                          owner_id = EXCLUDED.owner_id,
                          expires_at = EXCLUDED.expires_at,
                          updated_at = NOW()
                        WHERE runtime_lock.expires_at <= NOW()
                           OR runtime_lock.owner_id = EXCLUDED.owner_id
                        """,
                        key,
                        ownerId,
                        java.sql.Timestamp.from(expiresAt));
        return updated == 1;
    }

    public void release(String key, String ownerId) {
        jdbc.update(
                "DELETE FROM runtime_lock WHERE lock_key = ? AND owner_id = ?",
                key,
                ownerId);
    }

    @Scheduled(cron = "${app.runtime-lock-cleanup-cron:0 */5 * * * *}")
    public void cleanup() {
        jdbc.update("DELETE FROM runtime_lock WHERE expires_at <= NOW()");
    }
}
