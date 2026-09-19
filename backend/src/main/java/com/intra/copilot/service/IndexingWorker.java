package com.intra.copilot.service;

import com.intra.copilot.model.IndexingJob;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.repo.IndexingJobRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import jakarta.annotation.PreDestroy;
import java.lang.management.ManagementFactory;
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
 * <p>The claim query uses {@code FOR UPDATE SKIP LOCKED}, so several instances can run this worker
 * without stepping on each other. Concurrency stays low by default because the bottleneck is the
 * embedding provider's rate limit, not CPU.
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
    private final long leaseTimeoutSeconds;
    private final AtomicInteger threadCounter = new AtomicInteger();

    public IndexingWorker(
            IndexingJobRepository jobs,
            IndexingJobService jobService,
            KnowledgeIndexingService indexing,
            KnowledgeBaseRepository bases,
            JdbcTemplate jdbc,
            PlatformTransactionManager transactionManager,
            @Value("${kb.indexing.enabled:true}") boolean enabled,
            @Value("${kb.indexing.concurrency:2}") int concurrency,
            @Value("${kb.indexing.lease-timeout-seconds:1800}") long leaseTimeoutSeconds) {
        this.jobs = jobs;
        this.jobService = jobService;
        this.indexing = indexing;
        this.bases = bases;
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactionManager);
        this.enabled = enabled;
        this.concurrency = Math.max(1, concurrency);
        this.leaseTimeoutSeconds = Math.max(60, leaseTimeoutSeconds);
        this.workerId = ManagementFactory.getRuntimeMXBean().getName();
        ThreadFactory factory =
                runnable -> {
                    Thread thread =
                            new Thread(runnable, "kb-indexer-" + threadCounter.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                };
        this.executor = Executors.newFixedThreadPool(this.concurrency, factory);
    }

    @Scheduled(fixedDelayString = "${kb.indexing.poll-interval-ms:1000}")
    public void poll() {
        if (!enabled) return;
        recoverExpiredJobs();
        reapWaitingParents();
        int slots = concurrency - running.get();
        for (int i = 0; i < slots; i++) {
            Claim claim = claim();
            if (claim == null) break;
            running.incrementAndGet();
            executor.submit(
                    () -> {
                        try {
                            run(claim);
                        } finally {
                            running.decrementAndGet();
                        }
                    });
        }
    }

    /** Atomically moves one queued job to RUNNING and returns its id, if any. */
    private Claim claim() {
        return transaction.execute(
                status -> {
                    List<String> candidates =
                            jdbc.queryForList(
                                    "SELECT id FROM indexing_job WHERE status = 'QUEUED'"
                                            + " AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())"
                                            + " ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
                                    String.class);
                    if (candidates.isEmpty()) return null;
                    String id = candidates.get(0);
                    String leaseToken = workerId + ":" + UUID.randomUUID();
                    jdbc.update(
                            "UPDATE indexing_job SET status = 'RUNNING', attempt = attempt + 1, worker_id = ?,"
                                    + " lease_token = ?, started_at = NOW(), heartbeat_at = NOW(),"
                                    + " next_attempt_at = NULL WHERE id = ?",
                            workerId,
                            leaseToken,
                            id);
                    return new Claim(id, leaseToken);
                });
    }

    /**
     * Requeues work abandoned by a crashed process. Progress updates refresh the heartbeat, so a
     * healthy long-running document is not reclaimed.
     */
    private void recoverExpiredJobs() {
        List<ExpiredLease> expired =
                jdbc.query(
                        "SELECT id, lease_token FROM indexing_job WHERE status = 'RUNNING'"
                                + " AND COALESCE(heartbeat_at, started_at, created_at)"
                                + " < NOW() - (? * INTERVAL '1 second')"
                                + " ORDER BY created_at LIMIT ?",
                        (rs, row) ->
                                new ExpiredLease(rs.getString("id"), rs.getString("lease_token")),
                        leaseTimeoutSeconds,
                        Math.max(1, concurrency * 2));
        for (ExpiredLease lease : expired) {
            String message = "索引任务租约超时，已重新排队";
            IndexingJobService.RequeueOutcome outcome =
                    jobService.reclaimExpired(lease.jobId(), lease.leaseToken(), message);
            if (outcome.updated() && "DEAD".equals(outcome.status())) {
                indexing.discardPartial(outcome.jobId());
                indexing.markFailed(outcome.documentId(), message);
            }
        }
    }

    private void run(Claim claim) {
        IndexingJob job = jobs.findById(claim.jobId()).orElse(null);
        if (job == null) return;
        try {
            if (IndexingJob.TYPE_REBUILD_BASE.equals(job.getJobType())) {
                // The expansion into per-document jobs already happened at enqueue time.
                jobService.markWaiting(claim.jobId());
                return;
            }
            indexing.index(
                    job.getDocumentId(),
                    claim.jobId(),
                    progress ->
                            jobService.markProgress(claim.jobId(), claim.leaseToken(), progress));
            jobService.markSucceeded(claim.jobId(), claim.leaseToken());
        } catch (Exception error) {
            handleFailure(job, claim.leaseToken(), error);
        }
    }

    private void handleFailure(IndexingJob job, String leaseToken, Exception error) {
        String message =
                error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        IndexingJobService.RequeueOutcome outcome =
                jobService.requeueOrFail(job, leaseToken, message);
        if (!outcome.updated()) return;
        indexing.discardPartial(job.getId());
        if ("DEAD".equals(outcome.status())) {
            indexing.markFailed(job.getDocumentId(), message);
        }
    }

    /** Closes out REBUILD_BASE parents once every child job has settled. */
    private void reapWaitingParents() {
        List<String> waiting =
                jdbc.queryForList(
                        "SELECT id FROM indexing_job WHERE status = 'WAITING'", String.class);
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
        List<IndexingJob> children = jobs.findChildren(parent.getId());
        long failed =
                children.stream()
                        .filter(
                                child ->
                                        IndexingJob.STATUS_DEAD.equals(child.getStatus())
                                                || IndexingJob.STATUS_FAILED.equals(
                                                        child.getStatus()))
                        .count();
        if (failed > 0) {
            jobService.markFailed(
                    parent.getId(), failed + "/" + children.size() + " 个文档重建失败；失败文档继续使用上一代索引");
        } else {
            jobService.markSucceeded(parent.getId());
        }
        bases.findById(parent.getKnowledgeBaseId())
                .ifPresent(
                        base -> {
                            if (KnowledgeBase.STATUS_REBUILDING.equals(base.getStatus())) {
                                base.setStatus(
                                        failed > 0
                                                ? KnowledgeBase.STATUS_DEGRADED
                                                : KnowledgeBase.STATUS_READY);
                                base.touch();
                                bases.save(base);
                            }
                        });
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    private record Claim(String jobId, String leaseToken) {}

    private record ExpiredLease(String jobId, String leaseToken) {}
}
