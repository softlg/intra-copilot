package com.intra.copilot.infrastructure.observability;

import com.intra.copilot.infrastructure.persistence.conversation.AgentInvocationEventRepository;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Bounds the growth of high-volume event traces while keeping invocation summaries. */
@Service
public class TraceRetentionService {
    private static final Logger LOG = LoggerFactory.getLogger(TraceRetentionService.class);

    private final AgentInvocationEventRepository events;
    private final Duration retention;

    public TraceRetentionService(
            AgentInvocationEventRepository events,
            @Value("${trace.retention-days:30}") long retentionDays) {
        this.events = events;
        this.retention = Duration.ofDays(Math.max(1L, Math.min(3650L, retentionDays)));
    }

    @Scheduled(cron = "${trace.cleanup-cron:0 20 3 * * *}")
    public void cleanupExpiredEvents() {
        Instant cutoff = Instant.now().minus(retention);
        try {
            int deleted = events.deleteOlderThan(cutoff);
            if (deleted > 0) {
                LOG.info("Deleted {} expired trace events older than {}", deleted, cutoff);
            }
        } catch (RuntimeException error) {
            // Retention must never stop request processing or application startup.
            LOG.warn("Trace retention cleanup failed for cutoff {}", cutoff, error);
        }
    }
}
