package com.intra.copilot.service;

import com.intra.copilot.storage.DocumentStorage;
import com.intra.copilot.util.EntityIdGenerator;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Transactional outbox for object-store deletion, safe across restarts and multiple nodes. */
@Service
public class StorageDeletionService {
    private final JdbcTemplate jdbc;
    private final DocumentStorage storage;
    private final TransactionTemplate transaction;

    public StorageDeletionService(
            JdbcTemplate jdbc,
            DocumentStorage storage,
            PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public void enqueue(String backend, String storageKey) {
        if (storageKey == null || storageKey.isBlank()) return;
        jdbc.update(
                """
                INSERT INTO storage_delete_outbox(
                  id, storage_backend, storage_key, attempts, next_attempt_at, created_at)
                VALUES (?, ?, ?, 0, NOW(), NOW())
                """,
                EntityIdGenerator.next("SD"),
                backend == null || backend.isBlank() ? storage.backend() : backend,
                storageKey);
    }

    @Scheduled(fixedDelayString = "${app.storage-delete-poll-ms:5000}")
    public void processBatch() {
        List<Task> tasks =
                transaction.execute(
                        status -> {
                            List<Task> claimed =
                                    jdbc.query(
                                        """
                                        SELECT id, storage_key, attempts
                                        FROM storage_delete_outbox
                                        WHERE completed_at IS NULL
                                          AND next_attempt_at <= NOW()
                                        ORDER BY created_at
                                        LIMIT 50
                                        FOR UPDATE SKIP LOCKED
                                        """,
                                        (rs, index) ->
                                                new Task(
                                                        rs.getString("id"),
                                                        rs.getString("storage_key"),
                                                        rs.getInt("attempts")));
                            for (Task task : claimed) {
                                jdbc.update(
                                        """
                                        UPDATE storage_delete_outbox
                                        SET next_attempt_at = NOW() + INTERVAL '5 minutes'
                                        WHERE id = ?
                                        """,
                                        task.id());
                            }
                            return claimed;
                        });
        if (tasks == null || tasks.isEmpty()) return;
        for (Task task : tasks) {
            try {
                storage.delete(task.storageKey());
                jdbc.update(
                        """
                        UPDATE storage_delete_outbox
                        SET completed_at = NOW(), last_error = NULL
                        WHERE id = ?
                        """,
                        task.id());
            } catch (Exception error) {
                int attempts = task.attempts() + 1;
                long delaySeconds =
                        Math.min(3600L, Math.max(5L, (long) Math.pow(2, Math.min(10, attempts))));
                jdbc.update(
                        """
                        UPDATE storage_delete_outbox
                        SET attempts = ?,
                            next_attempt_at = ?,
                            last_error = ?
                        WHERE id = ?
                        """,
                        attempts,
                        java.sql.Timestamp.from(
                                Instant.now().plus(Duration.ofSeconds(delaySeconds))),
                        limit(error.getMessage(), 2000),
                        task.id());
            }
        }
    }

    private static String limit(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }

    private record Task(String id, String storageKey, int attempts) {}
}
