package com.intra.copilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentInvocationEvent;
import jakarta.annotation.PreDestroy;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Bounded asynchronous batch writer for high-volume execution trace events. */
@Component
public class TraceEventWriter {
    private static final Logger LOG = LoggerFactory.getLogger(TraceEventWriter.class);
    private static final int MAX_BATCH = 500;
    private final LinkedBlockingQueue<AgentInvocationEvent> queue =
            new LinkedBlockingQueue<>(10_000);
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public TraceEventWriter(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void append(AgentInvocationEvent event) {
        if (!queue.offer(event)) {
            LOG.warn(
                    "Trace queue full; dropping event invocation={} type={}",
                    event.getInvocationId(),
                    event.getEventType());
        }
    }

    @Scheduled(fixedDelayString = "${trace.write-flush-ms:500}")
    public void flush() {
        List<AgentInvocationEvent> batch = new ArrayList<>(MAX_BATCH);
        queue.drainTo(batch, MAX_BATCH);
        if (batch.isEmpty()) return;
        try {
            jdbc.batchUpdate(
                    """
                    INSERT INTO agent_invocation_event(
                      id, invocation_id, correlation_id, trace_id, turn_id, attempt_no,
                      span_id, parent_event_id, causation_event_id, plan_id, plan_step_id,
                      event_type, event_name, status, payload, duration_ms,
                      sequence, sequence_global, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::json, ?, ?, ?, ?)
                    """,
                    batch,
                    batch.size(),
                    (statement, event) -> {
                        statement.setString(1, event.getId());
                        statement.setString(2, event.getInvocationId());
                        statement.setString(3, event.getCorrelationId());
                        statement.setString(4, event.getTraceId());
                        statement.setString(5, event.getTurnId());
                        if (event.getAttemptNo() == null) statement.setNull(6, java.sql.Types.INTEGER);
                        else statement.setInt(6, event.getAttemptNo());
                        statement.setString(7, event.getSpanId());
                        statement.setString(8, event.getParentEventId());
                        statement.setString(9, event.getCausationEventId());
                        statement.setString(10, event.getPlanId());
                        statement.setString(11, event.getPlanStepId());
                        statement.setString(12, event.getEventType());
                        statement.setString(13, event.getEventName());
                        statement.setString(14, event.getStatus());
                        statement.setString(
                                15,
                                event.getPayload() == null
                                        ? null
                                        : payloadJson(event));
                        if (event.getDurationMs() == null) statement.setNull(16, java.sql.Types.BIGINT);
                        else statement.setLong(16, event.getDurationMs());
                        if (event.getSequence() == null) statement.setNull(17, java.sql.Types.INTEGER);
                        else statement.setInt(17, event.getSequence());
                        if (event.getSequenceGlobal() == null) statement.setNull(18, java.sql.Types.BIGINT);
                        else statement.setLong(18, event.getSequenceGlobal());
                        statement.setTimestamp(19, Timestamp.from(event.getCreatedAt()));
                    });
        } catch (RuntimeException error) {
            LOG.error("Failed to persist trace batch of {} events", batch.size(), error);
            for (AgentInvocationEvent event : batch) {
                if (!queue.offer(event)) {
                    LOG.error(
                            "Trace queue full while retrying event invocation={} type={}",
                            event.getInvocationId(),
                            event.getEventType());
                }
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        flush();
    }

    private String payloadJson(AgentInvocationEvent event) {
        try {
            return json.writeValueAsString(event.getPayload());
        } catch (Exception error) {
            throw new IllegalStateException("Trace payload serialization failed", error);
        }
    }
}
