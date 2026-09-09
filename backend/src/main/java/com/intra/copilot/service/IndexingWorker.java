package com.intra.copilot.service;

import com.intra.copilot.model.IndexingJob;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.repo.IndexingJobRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import jakarta.annotation.PreDestroy;
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Drains the indexing queue.
 *
 * <p>The claim query uses {@code FOR UPDATE SKIP LOCKED}, so several instances can run
 * this worker without stepping on each other. Concurrency stays low by default because
 * the bottleneck is the embedding provider's rate limit, not CPU.
 */
@Component
public class IndexingWorker {

    private final IndexingJobRepository jobs;
    private final IndexingJobService jobService;
    private final KnowledgeIndexingService indexing;
    private final KnowledgeBaseRepository bases;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final ExecutorService executor;
    private final AtomicInteger running = new AtomicInteger();
    private final String workerId;
    private final int concurrency;
    private final boolean enabled;
    private final AtomicInteger threadCounter = new AtomicInteger();

    public IndexingWorker(IndexingJobRepository jobs, IndexingJobService jobService,
            KnowledgeIndexingService indexing, KnowledgeBaseRepository bases, JdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            @Value("${kb.indexing.enabled:true}") boolean enabled,
            @Value("${kb.indexing.concurrency:2}") int concurrency) {
        this.jobs = jobs;
        this.jobService = jobService;
        this.indexing = indexing;
        this.bases = bases;
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.enabled = enabled;
        this.concurrency = Math.max(1, concurrency);
        this.workerId = ManagementFactory.getRuntimeMXBean().getName();
        ThreadFactory factory = runnable -> {
            Thread thread = new Thread(runnable, "kb-indexer-" + running.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
        this.executor = Executors.newFixedThreadPool(this.concurrency, factory);
        running.set(0);
    }

    @Scheduled(fixedDelayString = "${kb.indexing.poll-interval-ms:1000}")
    public void poll() {
        if (!enabled) return;
        reapWaitingParents();
        int slots = concurrency - running.get();
        for (int i = 0; i < slots; i++) {
            String jobId = claim();
            if (jobId == null) break;
            running.incrementAndGet();
            executor.submit(() -> {
                try {
                    run(jobId);
                } finally {
                    running.decrementAndGet();
                }
            });
        }
    }

    /** Atomically moves one queued job to RUNNING and returns its id, if any. */
    private String claim() {
        return transaction.execute(status -> {
            List<String> candidates = jdbc.queryForList(
                    "SELECT id FROM indexing_job WHERE status = 'QUEUED'"
                            + " AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())"
                            + " ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED", String.class);
            if (candidates.isEmpty()) return null;
            String id = candidates.get(0);
            jdbc.update("UPDATE indexing_job SET status = 'RUNNING', attempt = attempt + 1, worker_id = ?,"
                    + " started_at = NOW(), next_attempt_at = NULL WHERE id = ?", workerId, id);
            return id;
        });
    }

    private void run(String jobId) {
        IndexingJob job = jobs.findById(jobId).orElse(null);
        if (job == null) return;
        try {
            if (IndexingJob.TYPE_REBUILD_BASE.equals(job.getJobType())) {
                // The expansion into per-document jobs already happened at enqueue time.
                jobService.markWaiting(jobId);
                return;
            }
            indexing.index(job.getDocumentId(), jobId, progress -> jobService.markProgress(jobId, progress));
            jobService.markSucceeded(jobId);
        } catch (Exception error) {
            handleFailure(job, error);
        }
    }

    private void handleFailure(IndexingJob job, Exception error) {
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        indexing.discardPartial(job.getId());
        int attempt = Math.max(1, job.getAttempt());
        if (attempt >= job.getMaxAttempts()) {
            indexing.markFailed(job.getDocumentId(), message);
            jobs.findById(job.getId()).ifPresent(current -> {
                current.setStatus(IndexingJob.STATUS_DEAD);
                current.setError(message);
                current.setFinishedAt(Instant.now());
                jobs.save(current);
            });
            jdbc.update("INSERT INTO indexing_dead_letter (id, job_id, document_id, knowledge_base_id, job_type, payload, error)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    UUID.randomUUID().toString(), job.getId(), job.getDocumentId(), job.getKnowledgeBaseId(),
                    job.getJobType(), job.getPayload(), message);
            return;
        }
        long delaySeconds = Math.min(60L, 5L * attempt);
        jobs.findById(job.getId()).ifPresent(current -> {
            current.setStatus(IndexingJob.STATUS_QUEUED);
            current.setError(message);
            current.setNextAttemptAt(Instant.now().plus(delaySeconds, ChronoUnit.SECONDS));
            jobs.save(current);
        });
    }

    /** Closes out REBUILD_BASE parents once every child job has settled. */
    private void reapWaitingParents() {
        List<String> waiting = jdbc.queryForList("SELECT id FROM indexing_job WHERE status = 'WAITING'", String.class);
        for (String parentId : waiting) {
            IndexingJob parent = jobs.findById(parentId).orElse(null);
            if (parent == null) continue;
            List<IndexingJob> children = jobs.findChildren(parentId);
            if (children.isEmpty()) {
                finishParent(parent);
                continue;
            }
            long done = children.stream().filter(child -> !child.isActive()).count();
            if (done >= children.size()) {
                finishParent(parent);
            } else {
                jobService.markProgress(parentId, (int) Math.round(done * 100.0 / children.size()));
            }
        }
    }

    private void finishParent(IndexingJob parent) {
        jobService.markSucceeded(parent.getId());
        bases.findById(parent.getKnowledgeBaseId()).ifPresent(base -> {
            if (KnowledgeBase.STATUS_REBUILDING.equals(base.getStatus())) {
                base.setStatus(KnowledgeBase.STATUS_READY);
                base.touch();
                bases.save(base);
            }
        });
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
