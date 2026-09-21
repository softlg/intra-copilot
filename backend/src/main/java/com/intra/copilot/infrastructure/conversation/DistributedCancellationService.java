package com.intra.copilot.infrastructure.conversation;

import java.time.Duration;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Shared cancellation flags for streamed workloads running behind a load balancer. */
@Service
public class DistributedCancellationService {
    private final JdbcTemplate jdbc;

    public DistributedCancellationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void request(String streamId) {
        if (streamId == null || streamId.isBlank()) return;
        Instant expiresAt = Instant.now().plus(Duration.ofMinutes(30));
        jdbc.update(
                """
                INSERT INTO stream_cancellation(
                  stream_id, cancel_requested, expires_at, updated_at)
                VALUES (?, TRUE, ?, NOW())
                ON CONFLICT (stream_id) DO UPDATE SET
                  cancel_requested = TRUE,
                  expires_at = EXCLUDED.expires_at,
                  updated_at = NOW()
                """,
                streamId,
                java.sql.Timestamp.from(expiresAt));
    }

    public boolean isCancelled(String streamId) {
        if (streamId == null || streamId.isBlank()) return false;
        Boolean value =
                jdbc.query(
                        """
                        SELECT cancel_requested
                        FROM stream_cancellation
                        WHERE stream_id = ?
                          AND expires_at > NOW()
                        """,
                        rs -> rs.next() && rs.getBoolean(1),
                        streamId);
        return Boolean.TRUE.equals(value);
    }

    public void clear(String streamId) {
        if (streamId != null && !streamId.isBlank()) {
            jdbc.update("DELETE FROM stream_cancellation WHERE stream_id = ?", streamId);
        }
    }

    @Scheduled(cron = "${app.stream-cancellation-cleanup-cron:0 */10 * * * *}")
    public void cleanup() {
        jdbc.update("DELETE FROM stream_cancellation WHERE expires_at <= NOW()");
    }
}
