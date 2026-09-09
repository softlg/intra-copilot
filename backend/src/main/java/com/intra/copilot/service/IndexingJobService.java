package com.intra.copilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.model.IndexingJob;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.repo.IndexingJobRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.KnowledgeDocumentRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Enqueues and reports on indexing work.
 *
 * <p>Queueing is table based on purpose: the deployment has no extra broker, the volume
 * is modest, and {@code FOR UPDATE SKIP LOCKED} already gives safe multi-instance
 * draining. Moving to Redis Streams later only means replacing the claim query.
 */
@Service
public class IndexingJobService {

    private final IndexingJobRepository jobs;
    private final KnowledgeBaseRepository bases;
    private final KnowledgeDocumentRepository documents;
    private final EmbeddingProfileService embeddingProfiles;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Environment environment;

    public IndexingJobService(IndexingJobRepository jobs, KnowledgeBaseRepository bases,
            KnowledgeDocumentRepository documents, EmbeddingProfileService embeddingProfiles,
            JdbcTemplate jdbc, ObjectMapper json, Environment environment) {
        this.jobs = jobs;
        this.bases = bases;
        this.documents = documents;
        this.embeddingProfiles = embeddingProfiles;
        this.jdbc = jdbc;
        this.json = json;
        this.environment = environment;
    }

    public String enqueueParse(String baseId, String documentId) {
        return enqueue(baseId, documentId, IndexingJob.TYPE_PARSE, null, null);
    }

    public String enqueueReindex(String baseId, String documentId) {
        return enqueue(baseId, documentId, IndexingJob.TYPE_REINDEX, null, null);
    }

    public String enqueue(String baseId, String documentId, String type, String parentId, String payload) {
        if (documentId != null) {
            for (IndexingJob active : jobs.findActiveByDocumentId(documentId)) {
                if (type.equals(active.getJobType())) return active.getId();
            }
        }
        IndexingJob job = new IndexingJob();
        job.setKnowledgeBaseId(baseId);
        job.setDocumentId(documentId);
        job.setJobType(type);
        job.setParentId(parentId);
        job.setPayload(payload);
        job.setMaxAttempts(Math.max(1, environment.getProperty("kb.indexing.max-attempts", Integer.class, 3)));
        try {
            jobs.save(job);
            return job.getId();
        } catch (DataIntegrityViolationException e) {
            // Lost a race with another request; the existing job already covers this work.
            List<IndexingJob> active = documentId != null
                    ? jobs.findActiveByDocumentId(documentId)
                    : jobs.findActiveByKnowledgeBaseId(baseId);
            return active.stream()
                    .filter(item -> type.equals(item.getJobType()))
                    .map(IndexingJob::getId)
                    .findFirst()
                    .orElseThrow(() -> e);
        }
    }

    public IndexingJob status(String jobId) {
        return jobs.findById(jobId).orElseThrow(() -> new IllegalArgumentException("任务不存在"));
    }

    public List<IndexingJob> recent(String baseId, int limit) {
        return jobs.findRecentByKnowledgeBaseId(baseId, limit);
    }

    public IndexingJob latestForDocument(String baseId, String documentId) {
        return jobs.findRecentByKnowledgeBaseId(baseId, 50).stream()
                .filter(job -> documentId.equals(job.getDocumentId()))
                .findFirst()
                .orElse(null);
    }

    /**
     * Re-indexes every document in a base, optionally under a different embedding profile.
     *
     * <p>A dimension change invalidates every stored vector, so {@code dryRun} is the only
     * way to see the cost before committing to it.
     */
    public RebuildResult rebuild(String baseId, String profileId, boolean dryRun) {
        KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        EmbeddingProfile current = embeddingProfiles.resolve(base);
        EmbeddingProfile target = profileId == null || profileId.isBlank() ? current : embeddingProfiles.get(profileId);
        if (profileId != null && !profileId.isBlank() && !target.isEnabled()) {
            throw new IllegalArgumentException("不能选择已停用的 Embedding 配置");
        }

        List<KnowledgeDocument> all = documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(baseId);
        long documentCount = all.size();
        long[] chunkStats = chunkStats(baseId);
        long chunkCount = chunkStats[0];
        long characters = chunkStats[1];
        long tokens = Math.round(characters / 3.5);
        int qps = Math.max(1, environment.getProperty("embedding.providers." + target.getProvider() + ".qps", Integer.class, 60));
        long seconds = (long) Math.ceil(chunkCount / (double) qps);
        double costPerThousand = environment.getProperty("embedding.providers." + target.getProvider() + ".cost-per-1k-tokens", Double.class, 0.00002);
        double cost = tokens / 1000.0 * costPerThousand;

        List<String> warnings = new ArrayList<>();
        boolean dimensionChanged = current.getDimension() != target.getDimension();
        if (dimensionChanged) {
            warnings.add("维度从 " + current.getDimension() + " 变为 " + target.getDimension() + "，全部向量需要重建，重建期间旧向量仍可检索");
        }
        if (chunkCount == 0) {
            warnings.add("该知识库当前没有可重建的分块，请先上传并成功索引文档");
        }

        if (dryRun) {
            return new RebuildResult(null, documentCount, chunkCount, tokens, seconds, cost,
                    current.getDimension(), target.getDimension(), dimensionChanged, warnings, true);
        }

        if (profileId != null && !profileId.isBlank()) {
            base.setEmbeddingProfileId(profileId);
        }
        base.setStatus(KnowledgeBase.STATUS_REBUILDING);
        base.touch();
        bases.save(base);

        String parentId = enqueue(baseId, null, IndexingJob.TYPE_REBUILD_BASE, null, writePayload(target, documentCount));
        long queued = 0;
        for (KnowledgeDocument document : all) {
            if ("PENDING".equals(document.getStatus()) || "PARSING".equals(document.getStatus())
                    || "CHUNKING".equals(document.getStatus()) || "EMBEDDING".equals(document.getStatus())) {
                continue;
            }
            document.setStatus("STALE");
            document.touch();
            documents.save(document);
            enqueue(baseId, document.getId(), IndexingJob.TYPE_REINDEX, parentId, null);
            queued++;
        }
        if (queued == 0) {
            base.setStatus("READY");
            base.touch();
            bases.save(base);
        }
        return new RebuildResult(parentId, queued, chunkCount, tokens, seconds, cost,
                current.getDimension(), target.getDimension(), dimensionChanged, warnings, false);
    }

    private String writePayload(EmbeddingProfile profile, long documentCount) {
        try {
            return json.createObjectNode()
                    .put("embeddingProfileId", profile.getId())
                    .put("embeddingModel", profile.getModel())
                    .put("dimension", profile.getDimension())
                    .put("documentCount", documentCount)
                    .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private long[] chunkStats(String baseId) {
        return jdbc.queryForObject(
                "SELECT COUNT(*), COALESCE(SUM(LENGTH(c.content)), 0) FROM document_chunk c"
                        + " JOIN knowledge_document d ON d.id = c.document_id WHERE d.knowledge_base_id = ?",
                (rs, row) -> new long[]{rs.getLong(1), rs.getLong(2)}, baseId);
    }

    public void markWaiting(String jobId) {
        jobs.findById(jobId).ifPresent(job -> {
            job.setStatus(IndexingJob.STATUS_WAITING);
            jobs.save(job);
        });
    }

    public void markSucceeded(String jobId) {
        jobs.findById(jobId).ifPresent(job -> {
            job.setStatus(IndexingJob.STATUS_SUCCEEDED);
            job.setProgress(100);
            job.setFinishedAt(Instant.now());
            job.setError(null);
            jobs.save(job);
        });
    }

    public void markProgress(String jobId, int progress) {
        jobs.findById(jobId).ifPresent(job -> {
            job.setProgress(progress);
            jobs.save(job);
        });
    }

    public record RebuildResult(String jobId, long documentCount, long chunkCount, long estimatedTokens,
                                long estimatedSeconds, double estimatedCostUsd, int currentDimension,
                                int targetDimension, boolean dimensionChanged, List<String> warnings, boolean dryRun) {}
}
