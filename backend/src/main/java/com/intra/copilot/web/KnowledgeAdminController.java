package com.intra.copilot.web;

import com.intra.copilot.model.DocumentChunk;
import com.intra.copilot.model.IndexingJob;
import com.intra.copilot.model.KnowledgeAuditLog;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.service.IndexingJobService;
import com.intra.copilot.service.KnowledgeAuditService;
import com.intra.copilot.service.KnowledgeRetriever;
import com.intra.copilot.service.KnowledgeService;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/admin/knowledge-bases")
public class KnowledgeAdminController {

    private final KnowledgeService service;
    private final IndexingJobService jobs;
    private final KnowledgeAuditService auditLog;

    public KnowledgeAdminController(KnowledgeService service, IndexingJobService jobs, KnowledgeAuditService auditLog) {
        this.service = service;
        this.jobs = jobs;
        this.auditLog = auditLog;
    }

    @GetMapping
    public List<KnowledgeBase> list() {
        return service.listBases();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public KnowledgeBase create(@RequestBody KnowledgeBase b) {
        if (b.getName() == null || b.getName().isBlank()) throw new IllegalArgumentException("知识库名称不能为空");
        return service.createBase(b);
    }

    @PutMapping("/{id}")
    public KnowledgeBase update(@PathVariable String id, @RequestBody KnowledgeBase b) {
        return service.updateBase(id, b);
    }

    @GetMapping("/{id}/delete-impact")
    public KnowledgeService.DeleteImpact deleteImpact(@PathVariable String id) {
        return service.deleteImpact(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        service.deleteBase(id);
    }

    @GetMapping("/{id}/documents")
    public List<KnowledgeDocument> documents(@PathVariable String id) {
        return service.listDocuments(id);
    }

    @GetMapping("/{id}/documents/{documentId}")
    public KnowledgeDocument document(@PathVariable String id, @PathVariable String documentId) {
        return service.getDocument(id, documentId);
    }

    @GetMapping("/{id}/documents/{documentId}/chunks")
    public List<DocumentChunk> chunks(@PathVariable String id, @PathVariable String documentId) {
        return service.listChunks(id, documentId);
    }

    @GetMapping("/{id}/documents/{documentId}/job")
    public IndexingJob documentJob(@PathVariable String id, @PathVariable String documentId) {
        return service.latestJob(id, documentId);
    }

    @PostMapping("/{id}/search")
    public List<KnowledgeRetriever.Result> search(@PathVariable String id, @RequestBody SearchRequest request) {
        if (request.query() == null || request.query().isBlank()) throw new IllegalArgumentException("检索问题不能为空");
        return service.searchBase(id, request.query(), request.topK() == null ? 5 : request.topK());
    }

    @GetMapping("/{id}/diagnostics")
    public KnowledgeService.Diagnostics diagnostics(@PathVariable String id) {
        return service.diagnostics(id);
    }

    /**
     * Uploads and immediately returns: the document is queued and the caller polls
     * {@code GET /{id}/documents} (or {@code /{id}/jobs}) for progress.
     */
    @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public KnowledgeDocument upload(@PathVariable String id, @RequestPart("file") MultipartFile file)
            throws IOException {
        return service.upload(id, file);
    }

    @PostMapping(value = "/{id}/documents/batch", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public KnowledgeService.UploadBatchResult uploadBatch(
            @PathVariable String id, @RequestPart("files") MultipartFile[] files) {
        return service.upload(id, files);
    }

    @PostMapping("/documents/{documentId}/reindex")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public KnowledgeDocument reindex(@PathVariable String documentId) {
        return service.reindex(documentId);
    }

    /**
     * Re-indexes every document in the base. {@code dryRun=true} only estimates the cost,
     * which is mandatory reading before switching to a different embedding dimension.
     */
    @PostMapping("/{id}/rebuild")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public IndexingJobService.RebuildResult rebuild(@PathVariable String id, @RequestBody(required = false) RebuildRequest request) {
        boolean dryRun = request != null && Boolean.TRUE.equals(request.dryRun());
        String profileId = request == null ? null : request.profileId();
        return jobs.rebuild(id, profileId, dryRun);
    }

    @GetMapping("/{id}/jobs")
    public List<IndexingJob> jobs(@PathVariable String id, @RequestParam(defaultValue = "20") int limit) {
        return jobs.recent(id, limit);
    }

    @GetMapping("/{id}/jobs/{jobId}")
    public IndexingJob job(@PathVariable String id, @PathVariable String jobId) {
        IndexingJob job = jobs.status(jobId);
        if (!id.equals(job.getKnowledgeBaseId())) throw new IllegalArgumentException("任务不属于该知识库");
        return job;
    }

    @GetMapping("/{id}/audit-log")
    public List<KnowledgeAuditLog> auditLog(@PathVariable String id, @RequestParam(defaultValue = "50") int limit) {
        return auditLog.recent(id, limit);
    }

    @DeleteMapping("/documents/{documentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDocument(@PathVariable String documentId) {
        service.deleteDocument(documentId);
    }

    public record SearchRequest(String query, Integer topK) {}

    public record RebuildRequest(String profileId, Boolean dryRun) {}

    public record IndexingJobServiceRebuildResult(String jobId, long documentCount, long chunkCount,
                                                  long estimatedTokens, long estimatedSeconds, double estimatedCostUsd,
                                                  int currentDimension, int targetDimension, boolean dimensionChanged,
                                                  List<String> warnings, boolean dryRun) {}
}
