package com.intra.copilot.service;

import com.intra.copilot.model.DocumentChunk;
import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.model.IndexingJob;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.model.KnowledgeDocumentStorage;
import com.intra.copilot.repo.DocumentChunkRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.KnowledgeDocumentRepository;
import com.intra.copilot.repo.KnowledgeDocumentStorageRepository;
import com.intra.copilot.service.parser.DocumentParserRegistry;
import com.intra.copilot.storage.DocumentStorage;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Knowledge base administration.
 *
 * <p>Upload and re-index only persist the intent (a document plus a queued job) and
 * return immediately; {@link IndexingWorker} runs the expensive parse/chunk/embed work.
 * Keeping the HTTP thread out of that loop is what makes a large PDF upload respond in
 * well under a second instead of blocking a request thread for tens of seconds.
 */
@Service
public class KnowledgeService implements KnowledgeRetriever {

    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_QUEUED = "QUEUED";
    private static final String STATUS_STALE = "STALE";

    private final KnowledgeBaseRepository bases;
    private final KnowledgeDocumentRepository documents;
    private final DocumentChunkRepository chunks;
    private final KnowledgeDocumentStorageRepository storageRecords;
    private final DocumentStorage storage;
    private final JdbcTemplate jdbc;
    private final EmbeddingClient embeddings;
    private final EmbeddingProfileService embeddingProfiles;
    private final EmbeddingSchema schema;
    private final DocumentParserRegistry parsers;
    private final IndexingJobService jobService;
    private final KnowledgeAuditService audit;
    private final long maxDocumentBytes;
    private final double similarityThreshold;

    public KnowledgeService(KnowledgeBaseRepository bases, KnowledgeDocumentRepository documents,
            DocumentChunkRepository chunks, KnowledgeDocumentStorageRepository storageRecords,
            DocumentStorage storage, JdbcTemplate jdbc, EmbeddingClient embeddings,
            EmbeddingProfileService embeddingProfiles, EmbeddingSchema schema, DocumentParserRegistry parsers,
            IndexingJobService jobService, KnowledgeAuditService audit,
            @Value("${rag.max-document-bytes:104857600}") long maxDocumentBytes,
            @Value("${rag.similarity-threshold:0.65}") double similarityThreshold) {
        this.bases = bases;
        this.documents = documents;
        this.chunks = chunks;
        this.storageRecords = storageRecords;
        this.storage = storage;
        this.jdbc = jdbc;
        this.embeddings = embeddings;
        this.embeddingProfiles = embeddingProfiles;
        this.schema = schema;
        this.parsers = parsers;
        this.jobService = jobService;
        this.audit = audit;
        this.maxDocumentBytes = Math.max(1, maxDocumentBytes);
        this.similarityThreshold = Math.max(0, Math.min(2, similarityThreshold));
    }

    public List<KnowledgeBase> listBases() {
        return bases.findAll();
    }

    public KnowledgeBase createBase(KnowledgeBase base) {
        String name = normalizeName(base.getName());
        ensureNameAvailable(name, null);
        base.setName(name);
        if (base.getId() == null || base.getId().isBlank()) base.setId(java.util.UUID.randomUUID().toString());
        if (base.getStatus() == null || base.getStatus().isBlank()) base.setStatus(KnowledgeBase.STATUS_READY);
        if (base.getChunkStrategy() == null || base.getChunkStrategy().isBlank()) base.setChunkStrategy("structured");
        KnowledgeBase saved = bases.save(base);
        audit.record(saved.getId(), null, com.intra.copilot.model.KnowledgeAuditLog.ACTION_CREATE_BASE, name);
        return saved;
    }

    public KnowledgeBase updateBase(String id, KnowledgeBase value) {
        KnowledgeBase base = bases.findById(id).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        String name = normalizeName(value.getName());
        ensureNameAvailable(name, id);
        base.setName(name);
        base.setDescription(value.getDescription());
        base.setEnabled(value.isEnabled());
        if (value.getChunkStrategy() != null && !value.getChunkStrategy().isBlank()) {
            base.setChunkStrategy(value.getChunkStrategy());
        }
        base.touch();
        KnowledgeBase saved = bases.save(base);
        audit.record(id, null, com.intra.copilot.model.KnowledgeAuditLog.ACTION_UPDATE_BASE, name);
        return saved;
    }

    /** Deletes the base, its stored originals and its vectors. */
    @Transactional
    public void deleteBase(String id) {
        KnowledgeBase base = bases.findById(id).orElse(null);
        if (base == null) return;
        for (KnowledgeDocument document : documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(id)) {
            deleteStoredBytes(document.getId());
        }
        bases.deleteById(id);
        audit.record(null, null, com.intra.copilot.model.KnowledgeAuditLog.ACTION_DELETE_BASE, base.getName() + " (" + id + ")");
    }

    /** What a delete would take with it; shown by the admin console before confirming. */
    public DeleteImpact deleteImpact(String baseId) {
        KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        List<KnowledgeDocument> docs = documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(baseId);
        long chunkCount = countValue("SELECT COUNT(*) FROM document_chunk c JOIN knowledge_document d ON d.id = c.document_id WHERE d.knowledge_base_id = ?", baseId);
        long vectorCount = 0;
        EmbeddingProfile profile = safeResolve(base);
        if (profile != null && schema.supports(profile.getDimension())) {
            vectorCount = countValue("SELECT COUNT(*) FROM " + schema.tableFor(profile.getDimension()) + " WHERE knowledge_base_id = ?", baseId);
        }
        long boundAgents = countValue("SELECT COUNT(*) FROM agent_definition WHERE knowledge_base_ids LIKE ?", "%\"" + baseId + "\"%");
        long readyCount = docs.stream().filter(d -> "READY".equals(d.getStatus())).count();
        long failedCount = docs.stream().filter(d -> isFailed(d.getStatus())).count();
        Instant lastActivity = docs.stream()
                .map(KnowledgeDocument::getUpdatedAt)
                .filter(java.util.Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(base.getUpdatedAt());
        return new DeleteImpact(baseId, base.getName(), docs.size(), readyCount, failedCount, chunkCount, vectorCount,
                boundAgents, lastActivity, activeJobCount(baseId));
    }

    public List<KnowledgeDocument> listDocuments(String baseId) {
        return documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(baseId);
    }

    public KnowledgeDocument getDocument(String baseId, String documentId) {
        KnowledgeDocument document = documents.findById(documentId).orElseThrow(() -> new IllegalArgumentException("文档不存在"));
        if (!baseId.equals(document.getKnowledgeBaseId())) throw new IllegalArgumentException("文档不属于该知识库");
        return document;
    }

    public List<DocumentChunk> listChunks(String baseId, String documentId) {
        getDocument(baseId, documentId);
        return chunks.findAllByDocumentIdOrderByChunkIndex(documentId);
    }

    public List<Result> searchBase(String baseId, String query, int topK) {
        if (bases.findById(baseId).isEmpty()) throw new IllegalArgumentException("知识库不存在");
        return search(query, List.of(baseId), topK);
    }

    public Diagnostics diagnostics(String baseId) {
        KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        EmbeddingProfile profile = embeddingProfiles.resolve(base);
        String table = schema.tableFor(profile.getDimension());
        boolean tableExists = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?)", Boolean.class, table));
        List<KnowledgeDocument> docs = documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(baseId);
        long errorCount = docs.stream().filter(d -> isFailed(d.getStatus())).count();
        long staleCount = docs.stream().filter(d -> STATUS_STALE.equals(d.getStatus())).count();

        List<DiagnosticIssue> issues = new ArrayList<>();
        if (!tableExists) {
            issues.add(new DiagnosticIssue("EMBEDDING_TABLE_MISSING", "critical",
                    "向量表 " + table + " 不存在，当前维度 " + profile.getDimension() + " 无法检索",
                    "执行对应的数据库迁移，或把知识库切换回已支持的 Embedding 维度"));
        }
        if (!schema.supports(profile.getDimension())) {
            issues.add(new DiagnosticIssue("DIMENSION_MISMATCH", "critical",
                    "Embedding 维度 " + profile.getDimension() + " 没有对应的向量表",
                    "新增维度迁移脚本，或改用 1024/1536/3072 的配置"));
        }
        if (errorCount > 0) {
            issues.add(new DiagnosticIssue("DOCUMENT_INDEXING_ERROR", "error",
                    errorCount + " 个文档索引失败", "在文档列表点击「重新索引」；连续失败可在死信队列查看原因"));
        }
        long missingVector = 0;
        if (tableExists) {
            missingVector = countValue("SELECT COUNT(*) FROM document_chunk c JOIN knowledge_document d ON d.id = c.document_id"
                    + " LEFT JOIN " + table + " e ON e.chunk_id = c.id"
                    + " WHERE d.knowledge_base_id = ? AND d.status = 'READY' AND e.chunk_id IS NULL", baseId);
            if (missingVector > 0) {
                issues.add(new DiagnosticIssue("READY_DOCUMENT_WITHOUT_VECTOR", "warning",
                        missingVector + " 个分块缺少向量", "对相关文档执行重新索引"));
            }
            long staleVectors = countValue("SELECT COUNT(*) FROM " + table + " e"
                    + " JOIN document_chunk c ON c.id = e.chunk_id"
                    + " JOIN knowledge_document d ON d.id = c.document_id"
                    + " WHERE d.knowledge_base_id = ? AND (c.embedding_model IS NULL OR c.embedding_model <> ?)",
                    baseId, profile.getModel());
            if (staleVectors > 0) {
                issues.add(new DiagnosticIssue("STALE_CHUNKS", "warning",
                        staleVectors + " 个分块由其它 Embedding 模型生成，检索结果可能不一致",
                        "切换 Embedding 配置后执行「重建知识库」"));
            }
        }
        if (staleCount > 0) {
            issues.add(new DiagnosticIssue("DOCUMENT_STALE", "info",
                    staleCount + " 个文档等待重建", "等待重建任务完成，或手动触发重建"));
        }
        long missingStorage = missingStorageCount(baseId, docs);
        if (missingStorage > 0) {
            issues.add(new DiagnosticIssue("STORAGE_BACKEND_OFFLINE", "warning",
                    missingStorage + " 个文档的原始文件不可读，无法重新解析（只能使用历史文本重建）",
                    "检查 " + storage.backend() + " 存储目录，或重新上传这些文档"));
        }
        if (countValue("SELECT COUNT(*) FROM knowledge_audit_log WHERE knowledge_base_id = ?", baseId) == 0) {
            issues.add(new DiagnosticIssue("MISSING_AUDIT_LOG", "info",
                    "该知识库还没有任何操作记录", "后续上传/重建/删除操作会自动记录"));
        }
        return new Diagnostics(baseId, profile.getProvider(), profile.getModel(), profile.getDimension(), tableExists,
                docs.size(), errorCount, staleCount, missingVector, base.getStatus(), issues);
    }

    /**
     * Stores the upload and queues indexing instead of running it inline.
     */
    @Transactional
    public KnowledgeDocument upload(String baseId, MultipartFile file) throws IOException {
        KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("上传文件不能为空");
        if (file.getSize() > maxDocumentBytes) throw new IllegalArgumentException("文件大小超过限制（最大 " + maxDocumentBytes + " 字节）");
        byte[] bytes = file.getBytes();
        String name = originalName(file);
        DocumentParser parser = parsers.forFilename(name);
        validateMediaType(name, file.getContentType());
        validateContentSignature(parser.id(), name, bytes);
        String hash = sha256(bytes);
        if (documents.findByKnowledgeBaseIdAndFileHash(base.getId(), hash).isPresent()) {
            throw new IllegalArgumentException("文件已存在：" + name);
        }

        KnowledgeDocument doc = new KnowledgeDocument();
        doc.setKnowledgeBaseId(base.getId());
        doc.setFilename(name);
        doc.setMediaType(file.getContentType());
        doc.setFileHash(hash);
        doc.setSizeBytes(file.getSize());
        doc.setParser(parser.id());
        doc.setChunkStrategy(base.getChunkStrategy());
        doc.setStatus(STATUS_PENDING);
        doc = documents.save(doc);

        DocumentStorage.StoredObject stored = storage.store(base.getId(), doc.getId(), name, bytes);
        KnowledgeDocumentStorage record = new KnowledgeDocumentStorage();
        record.setDocumentId(doc.getId());
        record.setStorageBackend(storage.backend());
        record.setStorageKey(stored.key());
        record.setSha256(stored.sha256());
        record.setByteSize(stored.byteSize());
        storageRecords.save(record);

        jobService.enqueueParse(base.getId(), doc.getId());
        doc.setStatus(STATUS_QUEUED);
        doc.touch();
        doc = documents.save(doc);
        audit.record(baseId, doc.getId(), com.intra.copilot.model.KnowledgeAuditLog.ACTION_UPLOAD,
                name + " (" + file.getSize() + " bytes)");
        return doc;
    }

    /** Batch upload that reports per-file failures instead of aborting the whole batch. */
    public UploadBatchResult upload(String baseId, MultipartFile[] files) {
        if (files == null || files.length == 0) throw new IllegalArgumentException("上传文件不能为空");
        List<KnowledgeDocument> uploaded = new ArrayList<>();
        List<UploadFailure> failures = new ArrayList<>();
        for (MultipartFile file : files) {
            try {
                uploaded.add(upload(baseId, file));
            } catch (Exception error) {
                failures.add(new UploadFailure(originalName(file), error.getMessage() == null
                        ? error.getClass().getSimpleName() : error.getMessage()));
            }
        }
        return new UploadBatchResult(uploaded, failures);
    }

    @Transactional
    public void deleteDocument(String id) {
        KnowledgeDocument document = documents.findById(id).orElse(null);
        if (document == null) return;
        deleteStoredBytes(id);
        documents.deleteById(id);
        audit.record(document.getKnowledgeBaseId(), id, com.intra.copilot.model.KnowledgeAuditLog.ACTION_DELETE_DOC, document.getFilename());
    }

    /** Queues a rebuild of a single document and returns immediately. */
    public KnowledgeDocument reindex(String id) {
        KnowledgeDocument document = documents.findById(id).orElseThrow(() -> new IllegalArgumentException("文档不存在"));
        String jobId = jobService.enqueueReindex(document.getKnowledgeBaseId(), id);
        if (!STATUS_QUEUED.equals(document.getStatus())) {
            document.setStatus(STATUS_QUEUED);
            document.setError(null);
            document.touch();
            documents.save(document);
        }
        audit.record(document.getKnowledgeBaseId(), id, com.intra.copilot.model.KnowledgeAuditLog.ACTION_REINDEX, jobId);
        return document;
    }

    public IndexingJob latestJob(String baseId, String documentId) {
        return jobService.latestForDocument(baseId, documentId);
    }

    @Override
    public List<Result> search(String query, List<String> ids, int topK) {
        if (query == null || query.isBlank() || ids == null || ids.isEmpty()) return List.of();
        List<RankedResult> ranked = new ArrayList<>();
        int limit = Math.max(1, Math.min(topK, 20));
        for (String id : ids) {
            KnowledgeBase base = bases.findById(id).orElse(null);
            if (base == null || !base.isEnabled()) continue;
            EmbeddingProfile profile = embeddingProfiles.resolve(base);
            if (!schema.supports(profile.getDimension())) continue;
            String table = schema.tableFor(profile.getDimension());
            String cast = schema.castFor(profile.getDimension());
            String vector = EmbeddingClient.literal(embeddings.embed(query, profile));
            String sql = "SELECT c.document_id,d.filename,c.page_number,c.content,(e.embedding <=> " + cast + ") AS distance"
                    + " FROM document_chunk c JOIN knowledge_document d ON d.id=c.document_id"
                    + " JOIN " + table + " e ON e.chunk_id=c.id"
                    + " WHERE e.knowledge_base_id = ? AND d.status = 'READY' AND (1 - (e.embedding <=> " + cast + ")) >= ?"
                    + " ORDER BY e.embedding <=> " + cast + " LIMIT ?";
            List<Result> local = jdbc.query(sql, new Object[]{vector, id, vector, similarityThreshold, vector, limit},
                    (rs, n) -> new Result(rs.getString("document_id"), rs.getString("filename"),
                            (Integer) rs.getObject("page_number"), rs.getString("content"), rs.getDouble("distance")));
            for (int rank = 0; rank < local.size(); rank++) ranked.add(new RankedResult(local.get(rank), 1.0 / (60 + rank + 1)));
        }
        ranked.sort(Comparator.comparingDouble(RankedResult::score).reversed());
        return ranked.stream().limit(limit).map(item -> new Result(item.result().documentId(), item.result().filename(),
                item.result().pageNumber(), item.result().content(), 1 - item.score())).toList();
    }

    private void deleteStoredBytes(String documentId) {
        storageRecords.findByDocumentId(documentId).ifPresent(record -> {
            try {
                storage.delete(record.getStorageKey());
            } catch (IOException e) {
                // A missing file must not block the delete; the row goes away with the document.
            }
            storageRecords.deleteById(documentId);
        });
    }

    private long missingStorageCount(String baseId, List<KnowledgeDocument> docs) {
        long missing = 0;
        for (KnowledgeDocument doc : docs) {
            Optional<KnowledgeDocumentStorage> record = storageRecords.findByDocumentId(doc.getId());
            if (record.isEmpty()) continue;
            try {
                storage.load(record.get().getStorageKey());
            } catch (Exception e) {
                missing++;
            }
        }
        return missing;
    }

    private long activeJobCount(String baseId) {
        return jobService.recent(baseId, 200).stream().filter(IndexingJob::isActive).count();
    }

    private long countValue(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }

    private EmbeddingProfile safeResolve(KnowledgeBase base) {
        try {
            return embeddingProfiles.resolve(base);
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean isFailed(String status) {
        return "ERROR".equals(status) || "FAILED".equals(status);
    }

    private String originalName(MultipartFile file) {
        String name = file.getOriginalFilename() == null ? "document" : file.getOriginalFilename();
        return java.nio.file.Paths.get(name).getFileName().toString();
    }

    private String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder out = new StringBuilder();
            for (byte value : digest) out.append(String.format("%02x", value));
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("无法计算文件指纹", e);
        }
    }

    private void validateContentSignature(String parserId, String filename, byte[] bytes) {
        if ("pdf".equals(parserId)) {
            if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-') {
                throw new IllegalArgumentException("文件内容不是有效的 PDF");
            }
            return;
        }
        if (!"text".equals(parserId)) return;
        for (byte value : bytes) {
            if (value == 0) throw new IllegalArgumentException("文本文件包含不可识别的二进制内容");
        }
    }

    private void validateMediaType(String filename, String mediaType) {
        if (mediaType == null || mediaType.isBlank() || "application/octet-stream".equalsIgnoreCase(mediaType)) return;
        String lower = filename.toLowerCase(Locale.ROOT);
        boolean valid = lower.endsWith(".pdf") ? "application/pdf".equalsIgnoreCase(mediaType)
                : ("text/plain".equalsIgnoreCase(mediaType) || "text/markdown".equalsIgnoreCase(mediaType)
                        || "text/x-markdown".equalsIgnoreCase(mediaType));
        if (!valid) throw new IllegalArgumentException("文件类型与扩展名不匹配");
    }

    private String normalizeName(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("知识库名称不能为空");
        return value.trim();
    }

    private void ensureNameAvailable(String name, String excludingId) {
        boolean duplicate = bases.findAll().stream()
                .anyMatch(item -> !item.getId().equals(excludingId) && item.getName() != null
                        && item.getName().trim().equalsIgnoreCase(name));
        if (duplicate) throw new IllegalArgumentException("知识库名称已存在");
    }

    private record RankedResult(Result result, double score) {}

    public record Diagnostics(String knowledgeBaseId, String provider, String model, int dimension,
                              boolean embeddingTableExists, long documentCount, long errorCount, long staleCount,
                              long missingVectorCount, String baseStatus, List<DiagnosticIssue> issues) {}

    public record DiagnosticIssue(String code, String severity, String message, String recommendation) {}

    public record DeleteImpact(String knowledgeBaseId, String name, long documentCount, long readyCount,
                               long failedCount, long chunkCount, long vectorCount, long boundAgentCount,
                               Instant lastActivityAt, long activeJobCount) {
        public boolean hasRecentActivity() {
            return lastActivityAt != null && lastActivityAt.isAfter(Instant.now().minus(7, ChronoUnit.DAYS));
        }
    }

    public record UploadBatchResult(List<KnowledgeDocument> documents, List<UploadFailure> failures) {}

    public record UploadFailure(String filename, String message) {}
}
