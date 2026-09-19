package com.intra.copilot.service.mcp;

import java.time.Duration;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Ensures a stateful STDIO process has one owner across backend instances. */
@Service
public class McpSessionLeaseService {
    private final JdbcTemplate jdbc;

    public McpSessionLeaseService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean tryAcquire(String serverId, String ownerId, Duration ttl) {
        int updated =
                jdbc.update(
                        """
                        INSERT INTO mcp_session_lease(server_id, owner_id, expires_at, updated_at)
                        VALUES (?, ?, ?, NOW())
                        ON CONFLICT (server_id) DO UPDATE SET
                          owner_id = EXCLUDED.owner_id,
                          expires_at = EXCLUDED.expires_at,
                          updated_at = NOW()
                        WHERE mcp_session_lease.expires_at <= NOW()
                           OR mcp_session_lease.owner_id = EXCLUDED.owner_id
                        """,
                        serverId,
                        ownerId,
                        java.sql.Timestamp.from(Instant.now().plus(ttl)));
        return updated == 1;
    }

    public void release(String serverId, String ownerId) {
        jdbc.update(
                "DELETE FROM mcp_session_lease WHERE server_id = ? AND owner_id = ?",
                serverId,
                ownerId);
    }

    @Scheduled(cron = "${mcp.session-lease-cleanup-cron:0 */5 * * * *}")
    public void cleanup() {
        jdbc.update("DELETE FROM mcp_session_lease WHERE expires_at <= NOW()");
    }
}
