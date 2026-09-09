package com.intra.copilot.service;

import com.intra.copilot.model.DocumentChunk;
import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.model.KnowledgeDocumentStorage;
import com.intra.copilot.repo.DocumentChunkRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.KnowledgeDocumentRepository;
import com.intra.copilot.repo.KnowledgeDocumentStorageRepository;
import com.intra.copilot.service.parser.DocumentParserRegistry;
import com.intra.copilot.storage.DocumentStorage;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Executes the parse -> chunk -> embed pipeline for one document.
 *
 * <p>Two invariants make failures survivable:
 *
 * <ol>
 *   <li>Every chunk written by a run is tagged with the {@code jobId} that produced it.
 *       The old chunks are only deleted after the last embedding succeeded, so a failed
 *       rebuild leaves the previously searchable content untouched.
 *   <li>Sources are re-read from the stored original bytes, so changing the parser or
 *       the chunking strategy does not require the user to upload the file again.
 * </ol>
 */
@Service
public class KnowledgeIndexingService {

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
    private final DocumentChunker chunker;

    public KnowledgeIndexingService(KnowledgeBaseRepository bases, KnowledgeDocumentRepository documents,
            DocumentChunkRepository chunks, KnowledgeDocumentStorageRepository storageRecords, DocumentStorage storage,
            JdbcTemplate jdbc, EmbeddingClient embeddings, EmbeddingProfileService embeddingProfiles,
            EmbeddingSchema schema, DocumentParserRegistry parsers, DocumentChunker chunker) {
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
        this.chunker = chunker;
    }

    /** Number of chunks a document currently has; used to estimate rebuild cost. */
    public int chunkCount(String documentId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM document_chunk WHERE document_id = ?", Integer.class, documentId);
        return count == null ? 0 : count;
    }

    /**
     * Runs the full pipeline.
     *
     * @param progress receives 0-100 as the run advances
     */
    public void index(String documentId, String jobId, IntConsumer progress) {
        KnowledgeDocument document = documents.findById(documentId)
                .orElseThrow(() -> new IllegalArgumentException("文档不存在"));
        KnowledgeBase base = bases.findById(document.getKnowledgeBaseId())
                .orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        EmbeddingProfile profile = embeddingProfiles.resolve(base);
        if (!schema.supports(profile.getDimension())) {
            throw new IllegalArgumentException("暂不支持的 Embedding 维度：" + profile.getDimension());
        }

        advance(document, "PARSING", progress, 10);
        ParsedSource source = readSource(document);

        advance(document, "CHUNKING", progress, 30);
        String strategy = resolveStrategy(base, document);
        List<PlannedChunk> planned = planChunks(document, source, strategy, jobId);
        if (planned.isEmpty()) {
            throw new IllegalStateException("未能从文档中提取到可索引的文本");
        }

        advance(document, "EMBEDDING", progress, 35);
        int total = planned.size();
        for (int i = 0; i < total; i++) {
            PlannedChunk plan = planned.get(i);
            DocumentChunk chunk = plan.chunk();
            chunk.setEmbeddingModel(profile.getModel());
            chunk.setEmbeddingDimension(profile.getDimension());
            chunk.setChunkStrategy(strategy);
            List<Double> vector = embeddings.embed(plan.text(), profile);
            chunks.save(chunk);
            storeEmbedding(plan.chunk(), base, profile, vector);
            progress.accept(35 + (int) Math.round((i + 1) * 60.0 / total));
        }

        // Atomic swap: only now drop chunks that were not produced by this run.
        jdbc.update("DELETE FROM document_chunk WHERE document_id = ? AND (job_id IS NULL OR job_id <> ?)",
                documentId, jobId);

        document.setStatus("READY");
        document.setError(null);
        document.setParser(source.parserId());
        document.setChunkStrategy(strategy);
        document.setEmbeddingModel(profile.getModel());
        document.setEmbeddingDimension(profile.getDimension());
        document.touch();
        documents.save(document);
        progress.accept(100);
    }

    /** Removes chunks produced by a failed run, keeping the previous generation searchable. */
    public void discardPartial(String jobId) {
        jdbc.update("DELETE FROM document_chunk WHERE job_id = ?", jobId);
    }

    public void markFailed(String documentId, String message) {
        documents.findById(documentId).ifPresent(document -> {
            document.setStatus("FAILED");
            document.setError(message);
            document.touch();
            documents.save(document);
        });
    }

    private ParsedSource readSource(KnowledgeDocument document) {
        var record = storageRecords.findByDocumentId(document.getId());
        if (record.isPresent()) {
            KnowledgeDocumentStorage stored = record.get();
            try {
                byte[] bytes = storage.load(stored.getStorageKey());
                DocumentParser parser = parsers.forFilename(document.getFilename());
                return new ParsedSource(parser.id(), parser.parse(bytes));
            } catch (Exception error) {
                throw new IllegalStateException("读取原始文件失败：" + error.getMessage(), error);
            }
        }
        // Pre-V21 documents have no stored bytes; fall back to the archived text so they
        // can still be re-indexed after a profile switch.
        List<String> archived = jdbc.query(
                "SELECT content FROM knowledge_document_content_archive WHERE document_id = ?",
                (rs, row) -> rs.getString("content"), document.getId());
        if (!archived.isEmpty() && archived.get(0) != null && !archived.get(0).isBlank()) {
            return new ParsedSource("archive", List.of(new DocumentParser.PageText(null, null, archived.get(0))));
        }
        throw new IllegalStateException("原始文件缺失且无历史文本，无法重建索引，请重新上传该文档");
    }

    private List<PlannedChunk> planChunks(KnowledgeDocument document, ParsedSource source, String strategy, String jobId) {
        List<PlannedChunk> planned = new ArrayList<>();
        int index = 0;
        for (DocumentParser.PageText page : source.pages()) {
            for (String part : chunker.split(strategy, page.text())) {
                DocumentChunk chunk = new DocumentChunk();
                chunk.setDocumentId(document.getId());
                chunk.setChunkIndex(index++);
                chunk.setContent(part);
                chunk.setPageNumber(page.pageNumber());
                chunk.setJobId(jobId);
                planned.add(new PlannedChunk(chunk, part));
            }
        }
        return planned;
    }

    private String resolveStrategy(KnowledgeBase base, KnowledgeDocument document) {
        if (document.getChunkStrategy() != null && !document.getChunkStrategy().isBlank()) return document.getChunkStrategy();
        if (base.getChunkStrategy() != null && !base.getChunkStrategy().isBlank()) return base.getChunkStrategy();
        return chunker.defaultStrategy();
    }

    private void advance(KnowledgeDocument document, String status, IntConsumer progress, int value) {
        document.setStatus(status);
        document.touch();
        documents.save(document);
        progress.accept(value);
    }

    private void storeEmbedding(DocumentChunk chunk, KnowledgeBase base, EmbeddingProfile profile, List<Double> vector) {
        String table = schema.tableFor(profile.getDimension());
        String cast = schema.castFor(profile.getDimension());
        jdbc.update("INSERT INTO " + table
                        + " (chunk_id, knowledge_base_id, embedding_profile_id, config_version, embedding) VALUES (?, ?, ?, ?, " + cast + ")"
                        + " ON CONFLICT (chunk_id) DO UPDATE SET embedding = EXCLUDED.embedding, embedding_profile_id = EXCLUDED.embedding_profile_id, config_version = EXCLUDED.config_version",
                chunk.getId(), base.getId(), profile.getId(), profile.getConfigVersion(), EmbeddingClient.literal(vector));
    }

    private record ParsedSource(String parserId, List<DocumentParser.PageText> pages) {}

    private record PlannedChunk(DocumentChunk chunk, String text) {}
}
