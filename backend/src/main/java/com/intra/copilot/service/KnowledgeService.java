package com.intra.copilot.service;

import com.intra.copilot.model.DocumentChunk;
import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.model.IndexingJob;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.model.KnowledgeDocumentStorage;
import com.intra.copilot.repo.DocumentChunkRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.KnowledgeDocumentAssetRepository;
import com.intra.copilot.repo.KnowledgeDocumentRepository;
import com.intra.copilot.repo.KnowledgeDocumentStorageRepository;
import com.intra.copilot.service.auth.RequestContext;
import com.intra.copilot.service.parser.DocumentParserRegistry;
import com.intra.copilot.storage.DocumentStorage;
import com.intra.copilot.util.EntityIdGenerator;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
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
    private final KnowledgeDocumentAssetRepository assetRecords;
    private final DocumentStorage storage;
    private final JdbcTemplate jdbc;
    private final EmbeddingClient embeddings;
    private final EmbeddingProfileService embeddingProfiles;
    private final EmbeddingSchema schema;
    private final DocumentParserRegistry parsers;
    private final IndexingJobService jobService;
    private final KnowledgeAuditService audit;
    private final long maxDocumentBytes;
    private final double defaultSimilarityThreshold;
    private final int defaultTopK;
    private final String defaultRetrievalMode;
    private final double defaultLexicalWeight;
    private final boolean defaultFallbackEnabled;
    private final TransactionTemplate transaction;

    public KnowledgeService(KnowledgeBaseRepository bases, KnowledgeDocumentRepository documents,
            DocumentChunkRepository chunks, KnowledgeDocumentStorageRepository storageRecords,
            KnowledgeDocumentAssetRepository assetRecords, DocumentStorage storage, JdbcTemplate jdbc, EmbeddingClient embeddings,
            EmbeddingProfileService embeddingProfiles, EmbeddingSchema schema, DocumentParserRegistry parsers,
            IndexingJobService jobService, KnowledgeAuditService audit,
            PlatformTransactionManager transactionManager,
            @Value("${rag.max-document-bytes:104857600}") long maxDocumentBytes,
            @Value("${rag.similarity-threshold:0.50}") double similarityThreshold,
            @Value("${rag.top-k:5}") int topK,
            @Value("${rag.retrieval-mode:HYBRID}") String retrievalMode,
            @Value("${rag.lexical-weight:0.30}") double lexicalWeight,
            @Value("${rag.fallback-enabled:true}") boolean fallbackEnabled) {
        this.bases = bases;
        this.documents = documents;
        this.chunks = chunks;
        this.storageRecords = storageRecords;
        this.assetRecords = assetRecords;
        this.storage = storage;
        this.jdbc = jdbc;
        this.embeddings = embeddings;
        this.embeddingProfiles = embeddingProfiles;
        this.schema = schema;
        this.parsers = parsers;
        this.jobService = jobService;
        this.audit = audit;
        this.maxDocumentBytes = Math.max(1, maxDocumentBytes);
        this.defaultSimilarityThreshold = clamp(similarityThreshold, 0, 1);
        this.defaultTopK = clamp(topK, 1, 20);
        this.defaultRetrievalMode = normalizeRetrievalMode(retrievalMode);
        this.defaultLexicalWeight = clamp(lexicalWeight, 0, 1);
        this.defaultFallbackEnabled = fallbackEnabled;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public List<KnowledgeBase> listBases() {
        return bases.findAll();
    }

    public KnowledgeBase createBase(KnowledgeBase base) {
        String name = normalizeName(base.getName());
        ensureNameAvailable(name, null);
        String actor = RequestContext.currentOrAnonymous().actorLabel();
        base.setCreatedBy(actor);
        base.setUpdatedBy(actor);
        base.setName(name);
        if (base.getId() == null || base.getId().isBlank()) base.setId(EntityIdGenerator.next("KB"));
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
        base.setUpdatedBy(RequestContext.currentOrAnonymous().actorLabel());
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
        for (int dimension : schema.supportedDimensions()) {
            vectorCount += countValue(
                    "SELECT COUNT(*) FROM " + schema.tableFor(dimension) + " WHERE knowledge_base_id = ?",
                    baseId);
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

    public List<Result> searchBase(String baseId, String query, Integer topK, RetrievalOverrides overrides) {
        if (bases.findById(baseId).isEmpty()) throw new IllegalArgumentException("知识库不存在");
        return searchInternal(query, List.of(baseId), topK, overrides);
    }

    public List<Result> searchBase(String baseId, String query, int topK) {
        return searchBase(baseId, query, topK, null);
    }

    @Transactional
    public KnowledgeBase updateRetrievalConfig(String id, RetrievalConfigRequest request) {
        KnowledgeBase base = bases.findById(id).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        if (request == null) throw new IllegalArgumentException("检索配置不能为空");
        if (request.topK() == null || request.topK() < 1 || request.topK() > 20) {
            throw new IllegalArgumentException("检索条数必须在 1 到 20 之间");
        }
        if (request.similarityThreshold() == null
                || request.similarityThreshold() < 0
                || request.similarityThreshold() > 1) {
            throw new IllegalArgumentException("相似度阈值必须在 0 到 1 之间");
        }
        if (request.lexicalWeight() == null || request.lexicalWeight() < 0 || request.lexicalWeight() > 1) {
            throw new IllegalArgumentException("关键词权重必须在 0 到 1 之间");
        }
        String mode = request.retrievalMode() == null
                ? "HYBRID"
                : request.retrievalMode().trim().toUpperCase(Locale.ROOT);
        if (!"DENSE".equals(mode) && !"HYBRID".equals(mode)) {
            throw new IllegalArgumentException("检索模式只能是 DENSE 或 HYBRID");
        }
        base.setRetrievalTopK(request.topK());
        base.setRetrievalSimilarityThreshold(request.similarityThreshold());
        base.setRetrievalMode(mode);
        base.setRetrievalLexicalWeight(request.lexicalWeight());
        base.setRetrievalFallbackEnabled(request.fallbackEnabled() == null || request.fallbackEnabled());
        base.touch();
        KnowledgeBase saved = bases.save(base);
        audit.record(id, null, com.intra.copilot.model.KnowledgeAuditLog.ACTION_UPDATE_RETRIEVAL,
                "topK=" + saved.getRetrievalTopK() + ", threshold=" + saved.getRetrievalSimilarityThreshold()
                        + ", mode=" + saved.getRetrievalMode() + ", lexicalWeight="
                        + saved.getRetrievalLexicalWeight() + ", fallback=" + saved.getRetrievalFallbackEnabled());
        return saved;
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
        long pageCount =
                docs.stream()
                        .map(KnowledgeDocument::getPageCount)
                        .filter(java.util.Objects::nonNull)
                        .mapToLong(Integer::longValue)
                        .sum();
        long tableCount =
                docs.stream()
                        .map(KnowledgeDocument::getTableCount)
                        .filter(java.util.Objects::nonNull)
                        .mapToLong(Integer::longValue)
                        .sum();
        long imageCount =
                docs.stream()
                        .map(KnowledgeDocument::getImageCount)
                        .filter(java.util.Objects::nonNull)
                        .mapToLong(Integer::longValue)
                        .sum();
        long attachmentCount =
                docs.stream()
                        .map(KnowledgeDocument::getAttachmentCount)
                        .filter(java.util.Objects::nonNull)
                        .mapToLong(Integer::longValue)
                        .sum();
        long extractedChars =
                docs.stream()
                        .map(KnowledgeDocument::getExtractedChars)
                        .filter(java.util.Objects::nonNull)
                        .mapToLong(Long::longValue)
                        .sum();
        List<String> extractionWarnings =
                docs.stream()
                        .map(KnowledgeDocument::getParseMetadata)
                        .filter(java.util.Objects::nonNull)
                        .flatMap(
                                metadata ->
                                        java.util.stream.StreamSupport.stream(
                                                metadata.path("warnings").spliterator(), false))
                        .map(com.fasterxml.jackson.databind.JsonNode::asText)
                        .filter(value -> !value.isBlank())
                        .distinct()
                        .limit(20)
                        .toList();

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
                    + " WHERE d.knowledge_base_id = ? AND (e.embedding_profile_id <> ?"
                    + " OR c.embedding_model IS NULL OR c.embedding_model <> ?"
                    + " OR c.embedding_dimension IS NULL OR c.embedding_dimension <> ?)",
                    baseId, profile.getId(), profile.getModel(), profile.getDimension());
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
        if (imageCount > 0 && extractedChars == 0) {
            issues.add(
                    new DiagnosticIssue(
                            "IMAGE_ONLY_CONTENT",
                            "warning",
                            "检测到图片内容，但没有可用于检索的文本",
                            "启用 OCR 并重新索引，或改用包含文本层的文档"));
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
        return new Diagnostics(
                baseId,
                profile.getProvider(),
                profile.getModel(),
                profile.getDimension(),
                tableExists,
                docs.size(),
                errorCount,
                staleCount,
                missingVector,
                pageCount,
                tableCount,
                imageCount,
                attachmentCount,
                extractedChars,
                extractionWarnings,
                base.getStatus(),
                issues);
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
        DocumentParser parser;
        try {
            parser = parsers.forFilename(name);
        } catch (IllegalArgumentException error) {
            if (isImageFilename(name)) {
                throw new IllegalArgumentException("图片文档需要启用 OCR，并安装 tesseract 语言包");
            }
            throw error;
        }
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
        try {
            storageRecords.save(record);
        } catch (RuntimeException error) {
            try {
                storage.delete(stored.key());
            } catch (IOException ignored) {
            }
            throw error;
        }

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
                KnowledgeDocument saved =
                        transaction.execute(
                                status -> {
                                    try {
                                        return upload(baseId, file);
                                    } catch (IOException error) {
                                        throw new UncheckedIOException(error);
                                    }
                                });
                uploaded.add(saved);
            } catch (Exception error) {
                Throwable cause =
                        error instanceof UncheckedIOException && error.getCause() != null
                                ? error.getCause()
                                : error;
                failures.add(
                        new UploadFailure(
                                originalName(file),
                                cause.getMessage() == null
                                        ? cause.getClass().getSimpleName()
                                        : cause.getMessage()));
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
        return searchInternal(query, ids, topK, null);
    }

    private List<Result> searchInternal(
            String query, List<String> ids, Integer requestedTopK, RetrievalOverrides overrides) {
        if (query == null || query.isBlank() || ids == null || ids.isEmpty()) return List.of();
        int requestedLimit = clamp(requestedTopK == null ? defaultTopK : requestedTopK, 1, 20);
        List<ScoredList> scoredLists = new ArrayList<>();
        Map<String, List<Double>> queryVectors = new HashMap<>();
        for (String id : ids) {
            KnowledgeBase base = bases.findById(id).orElse(null);
            if (base == null || !base.isEnabled()) continue;
            RetrievalConfig config = resolveRetrievalConfig(base, overrides);
            EmbeddingProfile profile = embeddingProfiles.resolve(base);
            if (!schema.supports(profile.getDimension())) continue;
            String table = schema.tableFor(profile.getDimension());
            String cast = schema.castFor(profile.getDimension());
            String vectorKey = profile.getId() + "|" + profile.getModel() + "|" + profile.getDimension();
            String vector = EmbeddingClient.literal(queryVectors.computeIfAbsent(
                    vectorKey, key -> embeddings.embed(query, profile)));
            int candidateLimit = Math.min(200, Math.max(30, config.topK() * 6));
            String sql = "SELECT c.id AS chunk_id,c.document_id,d.filename,c.page_number,c.chunk_index,"
                    + "c.section_path,c.block_type,c.token_count,c.content,"
                    + "(1 - (e.embedding <=> " + cast + ")) AS similarity"
                    + " FROM document_chunk c JOIN knowledge_document d ON d.id=c.document_id"
                    + " JOIN " + table + " e ON e.chunk_id=c.id"
                    + " WHERE e.knowledge_base_id = ?"
                    + " AND (c.embedding_model IS NULL OR c.embedding_model = ?)"
                    + " AND (c.embedding_dimension IS NULL OR c.embedding_dimension = ?)"
                    + " ORDER BY e.embedding <=> " + cast + " LIMIT ?";
            Map<String, Candidate> candidates = new LinkedHashMap<>();
            jdbc.query(sql,
                    new Object[]{vector, id, profile.getModel(), profile.getDimension(), vector,
                            candidateLimit},
                    (rs, row) -> {
                        double similarity = clamp(rs.getDouble("similarity"), 0, 1);
                        Candidate candidate = candidate(rs, similarity, 0);
                        candidates.put(candidate.chunkId(), candidate);
                        return candidate;
                    });

            if ("HYBRID".equals(config.mode())) {
                String lexicalQuery = query.toLowerCase(Locale.ROOT);
                String lexicalSql = "SELECT c.id AS chunk_id,c.document_id,d.filename,c.page_number,c.chunk_index,"
                        + "c.section_path,c.block_type,c.token_count,c.content,"
                        + "word_similarity(?, lower(c.content)) AS lexical_score"
                        + " FROM document_chunk c JOIN knowledge_document d ON d.id=c.document_id"
                        + " JOIN " + table + " e ON e.chunk_id=c.id"
                        + " WHERE e.knowledge_base_id = ? AND lower(c.content) %> ?"
                        + " AND (c.embedding_model IS NULL OR c.embedding_model = ?)"
                        + " AND (c.embedding_dimension IS NULL OR c.embedding_dimension = ?)"
                        + " ORDER BY lexical_score DESC LIMIT ?";
                jdbc.query(
                        lexicalSql,
                        new Object[]{
                            lexicalQuery,
                            id,
                            lexicalQuery,
                            profile.getModel(),
                            profile.getDimension(),
                            candidateLimit
                        },
                        (rs, row) -> {
                            double lexical = clamp(rs.getDouble("lexical_score"), 0, 1);
                            Candidate existing = candidates.get(rs.getString("chunk_id"));
                            Candidate candidate =
                                    existing == null
                                            ? candidate(rs, 0, lexical)
                                            : existing.withLexical(lexical);
                            candidates.put(candidate.chunkId(), candidate);
                            return candidate;
                        });
            }

            List<Candidate> ranked =
                    candidates.values().stream()
                            .map(item -> item.withScore(config, query))
                            .sorted(
                                    Comparator.comparingDouble(Candidate::score)
                                            .reversed()
                                            .thenComparing(
                                                    Comparator.comparingDouble(
                                                                    Candidate::similarity)
                                                            .reversed()))
                            .toList();
            List<Candidate> selected = selectCandidates(ranked, config);
            selected = expandCandidates(id, table, profile, selected);
            scoredLists.add(new ScoredList(config, selected));
        }
        if (scoredLists.isEmpty()) return List.of();
        if (scoredLists.size() == 1) {
            ScoredList only = scoredLists.get(0);
            List<Result> out = new ArrayList<>();
            int limit = requestedTopK == null ? only.config().topK() : requestedLimit;
            for (int i = 0; i < only.candidates().size() && i < limit; i++) {
                out.add(only.candidates().get(i).toResult(only.config(), i + 1));
            }
            return out;
        }

        List<FusedCandidate> fused = new ArrayList<>();
        for (ScoredList list : scoredLists) {
            double min = list.candidates().stream().mapToDouble(Candidate::score).min().orElse(0);
            double max = list.candidates().stream().mapToDouble(Candidate::score).max().orElse(0);
            for (int index = 0; index < list.candidates().size(); index++) {
                Candidate candidate = list.candidates().get(index);
                double normalized = max > min ? (candidate.score() - min) / (max - min) : 1;
                double rankScore = 1.0 / (index + 1);
                fused.add(new FusedCandidate(candidate, list.config(), 0.8 * normalized + 0.2 * rankScore));
            }
        }
        fused.sort(Comparator.comparingDouble(FusedCandidate::fusionScore).reversed());
        List<Result> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (FusedCandidate item : fused) {
            String key = item.candidate().chunkId() == null
                    ? item.candidate().documentId() + "|" + item.candidate().pageNumber() + "|" + item.candidate().content()
                    : item.candidate().chunkId();
            if (!seen.add(key)) continue;
            out.add(item.candidate().toResult(item.config(), out.size() + 1));
            if (out.size() >= requestedLimit) break;
        }
        return out;
    }

    private void deleteStoredBytes(String documentId) {
        for (com.intra.copilot.model.KnowledgeDocumentAsset asset :
                assetRecords.findAllByDocumentId(documentId)) {
            if (asset.getStorageKey() == null || asset.getStorageKey().isBlank()) continue;
            try {
                storage.delete(asset.getStorageKey());
            } catch (IOException ignored) {
                // A missing derived asset must not block deletion of the source document.
            }
        }
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

    private RetrievalConfig resolveRetrievalConfig(KnowledgeBase base, RetrievalOverrides overrides) {
        return resolveRetrievalConfig(
                base,
                overrides,
                defaultTopK,
                defaultSimilarityThreshold,
                defaultRetrievalMode,
                defaultLexicalWeight,
                defaultFallbackEnabled);
    }

    static RetrievalConfig resolveRetrievalConfig(
            KnowledgeBase base,
            RetrievalOverrides overrides,
            int defaultTopK,
            double defaultSimilarityThreshold,
            String defaultRetrievalMode,
            double defaultLexicalWeight,
            boolean defaultFallbackEnabled) {
        int topK = base.getRetrievalTopK() == null ? defaultTopK : base.getRetrievalTopK();
        double threshold = base.getRetrievalSimilarityThreshold() == null
                ? defaultSimilarityThreshold : base.getRetrievalSimilarityThreshold();
        String mode = base.getRetrievalMode() == null ? defaultRetrievalMode : base.getRetrievalMode();
        double lexicalWeight = base.getRetrievalLexicalWeight() == null
                ? defaultLexicalWeight : base.getRetrievalLexicalWeight();
        boolean fallback = base.getRetrievalFallbackEnabled() == null
                ? defaultFallbackEnabled : base.getRetrievalFallbackEnabled();
        if (overrides != null) {
            if (overrides.topK() != null) topK = overrides.topK();
            if (overrides.similarityThreshold() != null) threshold = overrides.similarityThreshold();
            if (overrides.retrievalMode() != null) mode = overrides.retrievalMode();
            if (overrides.lexicalWeight() != null) lexicalWeight = overrides.lexicalWeight();
            if (overrides.fallbackEnabled() != null) fallback = overrides.fallbackEnabled();
        }
        return new RetrievalConfig(clamp(topK, 1, 20), clamp(threshold, 0, 1),
                normalizeRetrievalMode(mode), clamp(lexicalWeight, 0, 1), fallback);
    }

    private static String normalizeRetrievalMode(String mode) {
        if (mode == null || mode.isBlank()) return "HYBRID";
        String normalized = mode.trim().toUpperCase(Locale.ROOT);
        return "DENSE".equals(normalized) ? "DENSE" : "HYBRID";
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
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
        if ("docx".equals(parserId) || "spreadsheet".equals(parserId) && filename.toLowerCase(Locale.ROOT).endsWith(".xlsx")
                || "pptx".equals(parserId)) {
            if (bytes.length < 4 || bytes[0] != 'P' || bytes[1] != 'K') {
                throw new IllegalArgumentException("Office 文件内容不是有效的 OOXML 文档");
            }
            return;
        }
        if ("spreadsheet".equals(parserId) && filename.toLowerCase(Locale.ROOT).endsWith(".xls")) {
            if (bytes.length < 8
                    || (bytes[0] & 0xff) != 0xd0
                    || (bytes[1] & 0xff) != 0xcf
                    || (bytes[2] & 0xff) != 0x11
                    || (bytes[3] & 0xff) != 0xe0) {
                throw new IllegalArgumentException("Excel 文件内容不是有效的 XLS 文档");
            }
            return;
        }
        if ("image".equals(parserId)) {
            if (!isSupportedImage(bytes)) {
                throw new IllegalArgumentException("图片文件内容无法识别");
            }
            return;
        }
        if (!"text".equals(parserId) && !"csv".equals(parserId) && !"html".equals(parserId))
            return;
        for (byte value : bytes) {
            if (value == 0) throw new IllegalArgumentException("文本文件包含不可识别的二进制内容");
        }
    }

    private void validateMediaType(String filename, String mediaType) {
        if (mediaType == null || mediaType.isBlank() || "application/octet-stream".equalsIgnoreCase(mediaType)) return;
        String lower = filename.toLowerCase(Locale.ROOT);
        boolean valid;
        if (lower.endsWith(".pdf")) {
            valid = "application/pdf".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".docx")) {
            valid =
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    .equalsIgnoreCase(mediaType)
                            || "application/zip".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".xlsx")) {
            valid =
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    .equalsIgnoreCase(mediaType)
                            || "application/zip".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".xls")) {
            valid = "application/vnd.ms-excel".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".pptx")) {
            valid =
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                    .equalsIgnoreCase(mediaType)
                            || "application/zip".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
            valid = "text/html".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".csv")) {
            valid =
                    "text/csv".equalsIgnoreCase(mediaType)
                            || "application/csv".equalsIgnoreCase(mediaType)
                            || "text/plain".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".tsv")) {
            valid =
                    "text/tab-separated-values".equalsIgnoreCase(mediaType)
                            || "text/plain".equalsIgnoreCase(mediaType);
        } else if (lower.endsWith(".png")
                || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".webp")
                || lower.endsWith(".bmp")
                || lower.endsWith(".tif")
                || lower.endsWith(".tiff")) {
            valid = mediaType.toLowerCase(Locale.ROOT).startsWith("image/");
        } else {
            valid =
                    "text/plain".equalsIgnoreCase(mediaType)
                            || "text/markdown".equalsIgnoreCase(mediaType)
                            || "text/x-markdown".equalsIgnoreCase(mediaType);
        }
        if (!valid) throw new IllegalArgumentException("文件类型与扩展名不匹配");
    }

    private boolean isSupportedImage(byte[] bytes) {
        if (bytes.length >= 8
                && (bytes[0] & 0xff) == 0x89
                && bytes[1] == 'P'
                && bytes[2] == 'N'
                && bytes[3] == 'G') return true;
        if (bytes.length >= 3
                && (bytes[0] & 0xff) == 0xff
                && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff) return true;
        if (bytes.length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P') return true;
        if (bytes.length >= 4
                && ((bytes[0] == 'I' && bytes[1] == 'I' && bytes[2] == 42 && bytes[3] == 0)
                        || (bytes[0] == 'M'
                                && bytes[1] == 'M'
                                && bytes[2] == 0
                                && bytes[3] == 42))) return true;
        return bytes.length >= 4 && bytes[0] == 'B' && bytes[1] == 'M';
    }

    private boolean isImageFilename(String filename) {
        if (filename == null) return false;
        String lower = filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".png")
                || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".webp")
                || lower.endsWith(".bmp")
                || lower.endsWith(".tif")
                || lower.endsWith(".tiff");
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

    private record Candidate(
            String chunkId,
            String documentId,
            String filename,
            Integer pageNumber,
            int chunkIndex,
            String sectionPath,
            String blockType,
            Integer tokenCount,
            String content,
            double similarity,
            double lexicalScore,
            double score,
            boolean belowThreshold) {

        private Candidate(
                String chunkId,
                String documentId,
                String filename,
                Integer pageNumber,
                int chunkIndex,
                String sectionPath,
                String blockType,
                Integer tokenCount,
                String content,
                double similarity,
                double lexicalScore,
                double score) {
            this(
                    chunkId,
                    documentId,
                    filename,
                    pageNumber,
                    chunkIndex,
                    sectionPath,
                    blockType,
                    tokenCount,
                    content,
                    similarity,
                    lexicalScore,
                    score,
                    false);
        }

        private Candidate withBelowThreshold() {
            return new Candidate(
                    chunkId,
                    documentId,
                    filename,
                    pageNumber,
                    chunkIndex,
                    sectionPath,
                    blockType,
                    tokenCount,
                    content,
                    similarity,
                    lexicalScore,
                    score,
                    true);
        }

        private Candidate withLexical(double value) {
            return new Candidate(
                    chunkId,
                    documentId,
                    filename,
                    pageNumber,
                    chunkIndex,
                    sectionPath,
                    blockType,
                    tokenCount,
                    content,
                    similarity,
                    value,
                    score,
                    belowThreshold);
        }

        private Candidate withScore(RetrievalConfig config, String query) {
            double hybrid =
                    (1 - config.lexicalWeight()) * similarity
                            + config.lexicalWeight() * lexicalScore;
            double resolved =
                    "DENSE".equals(config.mode())
                            ? similarity
                            : Math.max(hybrid, lexicalScore * 0.90);
            String normalizedQuery =
                    query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
            if (!normalizedQuery.isBlank()
                    && content != null
                    && content.toLowerCase(Locale.ROOT).contains(normalizedQuery)) {
                resolved = Math.min(1, resolved + 0.06);
            }
            if (("TABLE".equals(blockType) || "CODE".equals(blockType))
                    && lexicalScore >= 0.35) {
                resolved = Math.min(1, resolved + 0.04);
            }
            return new Candidate(
                    chunkId,
                    documentId,
                    filename,
                    pageNumber,
                    chunkIndex,
                    sectionPath,
                    blockType,
                    tokenCount,
                    content,
                    similarity,
                    lexicalScore,
                    resolved,
                    belowThreshold);
        }

        private Candidate withContent(String value) {
            return new Candidate(
                    chunkId,
                    documentId,
                    filename,
                    pageNumber,
                    chunkIndex,
                    sectionPath,
                    blockType,
                    tokenCount,
                    value,
                    similarity,
                    lexicalScore,
                    score,
                    belowThreshold);
        }

        private Result toResult(RetrievalConfig config, int rank) {
            return new Result(
                    chunkId,
                    documentId,
                    filename,
                    pageNumber,
                    chunkIndex,
                    sectionPath,
                    blockType,
                    tokenCount,
                    content,
                    1 - similarity,
                    similarity,
                    lexicalScore,
                    score,
                    config.mode(),
                    belowThreshold,
                    rank);
        }
    }

    private Candidate candidate(
            java.sql.ResultSet rs, double similarity, double lexicalScore) throws java.sql.SQLException {
        return new Candidate(
                rs.getString("chunk_id"),
                rs.getString("document_id"),
                rs.getString("filename"),
                (Integer) rs.getObject("page_number"),
                rs.getInt("chunk_index"),
                rs.getString("section_path"),
                rs.getString("block_type"),
                (Integer) rs.getObject("token_count"),
                rs.getString("content"),
                similarity,
                lexicalScore,
                similarity);
    }

    private List<Candidate> selectCandidates(
            List<Candidate> ranked, RetrievalConfig config) {
        List<Candidate> selected = new ArrayList<>();
        Set<String> selectedIds = new HashSet<>();
        Map<String, Integer> perDocument = new HashMap<>();
        for (Candidate candidate : ranked) {
            if (candidate.score() < config.similarityThreshold()) continue;
            int count = perDocument.getOrDefault(candidate.documentId(), 0);
            if (count >= 2) continue;
            selected.add(candidate);
            selectedIds.add(candidate.chunkId());
            perDocument.put(candidate.documentId(), count + 1);
            if (selected.size() >= config.topK()) return selected;
        }
        for (Candidate candidate : ranked) {
            if (candidate.score() < config.similarityThreshold()) continue;
            if (!selectedIds.add(candidate.chunkId())) continue;
            selected.add(candidate);
            if (selected.size() >= config.topK()) break;
        }
        if (selected.isEmpty() && config.fallbackEnabled() && !ranked.isEmpty()) {
            selected.add(ranked.get(0).withBelowThreshold());
        }
        return selected;
    }

    /**
     * Adds immediate neighbors of a selected chunk. This keeps split tables, definitions and
     * procedure steps together without indexing a second parent document.
     */
    private List<Candidate> expandCandidates(
            String baseId,
            String table,
            EmbeddingProfile profile,
            List<Candidate> selected) {
        if (selected.isEmpty()) return selected;
        List<Candidate> out = new ArrayList<>();
        Map<String, Set<Integer>> emitted = new HashMap<>();
        for (Candidate candidate : selected) {
            Set<Integer> emittedIndexes =
                    emitted.computeIfAbsent(candidate.documentId(), key -> new HashSet<>());
            if (!emittedIndexes.add(candidate.chunkIndex())) continue;
            List<NeighborChunk> neighbors =
                    jdbc.query(
                            "SELECT chunk_index, content FROM document_chunk"
                                    + " WHERE document_id = ? AND chunk_index BETWEEN ? AND ?"
                                    + " AND (embedding_model IS NULL OR embedding_model = ?)"
                                    + " AND (embedding_dimension IS NULL OR embedding_dimension = ?)"
                                    + " ORDER BY chunk_index",
                            new Object[]{
                                candidate.documentId(),
                                Math.max(0, candidate.chunkIndex() - 1),
                                candidate.chunkIndex() + 1,
                                profile.getModel(),
                                profile.getDimension()
                            },
                            (rs, row) ->
                                    new NeighborChunk(
                                            rs.getInt("chunk_index"), rs.getString("content")));
            StringBuilder content = new StringBuilder();
            for (NeighborChunk neighbor : neighbors) {
                if (!emittedIndexes.add(neighbor.chunkIndex())) continue;
                if (content.length() > 0) content.append("\n\n");
                if (neighbor.chunkIndex() != candidate.chunkIndex()) {
                    content.append("[相邻分块 ").append(neighbor.chunkIndex() + 1).append("]\n");
                }
                content.append(neighbor.content());
            }
            if (content.length() == 0) content.append(candidate.content());
            out.add(candidate.withContent(content.toString()));
            if (out.size() >= Math.max(1, selected.size())) break;
        }
        return out;
    }

    private record ScoredList(RetrievalConfig config, List<Candidate> candidates) {}

    private record FusedCandidate(Candidate candidate, RetrievalConfig config, double fusionScore) {}

    private record NeighborChunk(int chunkIndex, String content) {}

    public record RetrievalConfig(
            int topK, double similarityThreshold, String mode, double lexicalWeight, boolean fallbackEnabled) {}

    public record RetrievalOverrides(
            Integer topK,
            Double similarityThreshold,
            String retrievalMode,
            Double lexicalWeight,
            Boolean fallbackEnabled) {}

    public record RetrievalConfigRequest(
            Integer topK,
            Double similarityThreshold,
            String retrievalMode,
            Double lexicalWeight,
            Boolean fallbackEnabled) {}

    public record Diagnostics(
            String knowledgeBaseId,
            String provider,
            String model,
            int dimension,
            boolean embeddingTableExists,
            long documentCount,
            long errorCount,
            long staleCount,
            long missingVectorCount,
            long pageCount,
            long tableCount,
            long imageCount,
            long attachmentCount,
            long extractedChars,
            List<String> extractionWarnings,
            String baseStatus,
            List<DiagnosticIssue> issues) {}

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
