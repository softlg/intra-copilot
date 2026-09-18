package com.intra.copilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.DocumentChunk;
import com.intra.copilot.model.EmbeddingProfile;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.model.KnowledgeDocumentAsset;
import com.intra.copilot.model.KnowledgeDocumentStorage;
import com.intra.copilot.repo.DocumentChunkRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.KnowledgeDocumentAssetRepository;
import com.intra.copilot.repo.KnowledgeDocumentRepository;
import com.intra.copilot.repo.KnowledgeDocumentStorageRepository;
import com.intra.copilot.service.parser.DocumentParserRegistry;
import com.intra.copilot.storage.DocumentStorage;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.IntConsumer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Executes the parse -> chunk -> embed pipeline for one document.
 *
 * <p>Two invariants make failures survivable:
 *
 * <ol>
 *   <li>Every chunk written by a run is tagged with the {@code jobId} that produced it. The old
 *       chunks are only deleted after the last embedding succeeded, so a failed rebuild leaves the
 *       previously searchable content untouched.
 *   <li>Sources are re-read from the stored original bytes, so changing the parser or the chunking
 *       strategy does not require the user to upload the file again.
 * </ol>
 */
@Service
public class KnowledgeIndexingService {

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
    private final DocumentChunker chunker;
    private final ObjectMapper json;

    public KnowledgeIndexingService(
            KnowledgeBaseRepository bases,
            KnowledgeDocumentRepository documents,
            DocumentChunkRepository chunks,
            KnowledgeDocumentStorageRepository storageRecords,
            KnowledgeDocumentAssetRepository assetRecords,
            DocumentStorage storage,
            JdbcTemplate jdbc,
            EmbeddingClient embeddings,
            EmbeddingProfileService embeddingProfiles,
            EmbeddingSchema schema,
            DocumentParserRegistry parsers,
            DocumentChunker chunker,
            ObjectMapper json) {
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
        this.chunker = chunker;
        this.json = json;
    }

    /** Number of chunks a document currently has; used to estimate rebuild cost. */
    public int chunkCount(String documentId) {
        Integer count =
                jdbc.queryForObject(
                        "SELECT COUNT(*) FROM document_chunk WHERE document_id = ?",
                        Integer.class,
                        documentId);
        return count == null ? 0 : count;
    }

    /**
     * Runs the full pipeline.
     *
     * @param progress receives 0-100 as the run advances
     */
    public void index(String documentId, String jobId, IntConsumer progress) {
        KnowledgeDocument document =
                documents
                        .findById(documentId)
                        .orElseThrow(() -> new IllegalArgumentException("文档不存在"));
        KnowledgeBase base =
                bases.findById(document.getKnowledgeBaseId())
                        .orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
        EmbeddingProfile profile = embeddingProfiles.resolve(base);
        if (!schema.supports(profile.getDimension())) {
            throw new IllegalArgumentException("暂不支持的 Embedding 维度：" + profile.getDimension());
        }

        advance(document, "PARSING", progress, 10);
        ParsedSource source = readSource(document);
        Flattened flattened =
                collectDocument(
                        source.document(),
                        document,
                        base,
                        new ArrayList<>(),
                        new ArrayList<>(),
                        0);

        advance(document, "CHUNKING", progress, 30);
        String strategy = resolveStrategy(base, document);
        List<PlannedChunk> planned =
                planChunks(document, flattened.blocks(), strategy, jobId);
        if (planned.isEmpty()) {
            String detail =
                    flattened.warnings().isEmpty()
                            ? ""
                            : "；" + String.join("；", flattened.warnings());
            throw new IllegalStateException("未能从文档中提取到可索引的文本" + detail);
        }

        advance(document, "EMBEDDING", progress, 35);
        int total = planned.size();
        for (int i = 0; i < total; i++) {
            PlannedChunk plan = planned.get(i);
            DocumentChunk chunk = plan.chunk();
            if (profile.getMaxInputTokens() != null
                    && chunk.getTokenCount() != null
                    && chunk.getTokenCount() > profile.getMaxInputTokens()) {
                throw new IllegalStateException(
                        "分块 token 数 "
                                + chunk.getTokenCount()
                                + " 超过 Embedding 模型上限 "
                                + profile.getMaxInputTokens()
                                + "，请调小 rag.chunk-max-tokens");
            }
            chunk.setEmbeddingModel(profile.getModel());
            chunk.setEmbeddingDimension(profile.getDimension());
            chunk.setChunkStrategy(strategy);
            List<Double> vector = embeddings.embed(plan.text(), profile);
            chunks.save(chunk);
            storeEmbedding(plan.chunk(), base, profile, vector);
            progress.accept(35 + (int) Math.round((i + 1) * 60.0 / total));
        }

        // Atomic swap: only now drop chunks that were not produced by this run.
        jdbc.update(
                "DELETE FROM document_chunk WHERE document_id = ? AND (job_id IS NULL OR job_id <> ?)",
                documentId,
                jobId);
        replaceAssets(document, flattened.assets(), jobId, flattened.warnings());

        document.setStatus("READY");
        document.setError(null);
        document.setParser(source.parserId());
        document.setChunkStrategy(strategy);
        document.setEmbeddingModel(profile.getModel());
        document.setEmbeddingDimension(profile.getDimension());
        applyDocumentStats(document, source, flattened);
        document.touch();
        documents.save(document);
        progress.accept(100);
    }

    /** Removes chunks produced by a failed run, keeping the previous generation searchable. */
    public void discardPartial(String jobId) {
        jdbc.update("DELETE FROM document_chunk WHERE job_id = ?", jobId);
        for (KnowledgeDocumentAsset asset : assetRecords.findAllByJobId(jobId)) {
            deleteAssetObject(asset);
            assetRecords.deleteById(asset.getId());
        }
    }

    public void markFailed(String documentId, String message) {
        documents
                .findById(documentId)
                .ifPresent(
                        document -> {
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
                return new ParsedSource(parser.id(), parser.parseDocument(bytes));
            } catch (Exception error) {
                throw new IllegalStateException("读取原始文件失败：" + error.getMessage(), error);
            }
        }
        // Pre-V21 documents have no stored bytes; fall back to the archived text so they
        // can still be re-indexed after a profile switch.
        List<String> archived =
                jdbc.query(
                        "SELECT content FROM knowledge_document_content_archive WHERE document_id = ?",
                        (rs, row) -> rs.getString("content"),
                        document.getId());
        if (!archived.isEmpty() && archived.get(0) != null && !archived.get(0).isBlank()) {
            return new ParsedSource(
                    "archive",
                    new DocumentParser.ParsedDocument(
                            List.of(
                                    new DocumentParser.ParsedBlock(
                                            DocumentParser.BlockType.TEXT,
                                            null,
                                            null,
                                            archived.get(0),
                                            Map.of("source", "legacy-archive"))),
                            List.of(),
                            Map.of("source", "legacy-archive"),
                            List.of()));
        }
        throw new IllegalStateException("原始文件缺失且无历史文本，无法重建索引，请重新上传该文档");
    }

    private List<PlannedChunk> planChunks(
            KnowledgeDocument document,
            List<DocumentParser.ParsedBlock> blocks,
            String strategy,
            String jobId) {
        List<PlannedChunk> planned = new ArrayList<>();
        int index = 0;
        for (DocumentParser.ParsedBlock block : blocks) {
            if (block.text() == null || block.text().isBlank()) continue;
            for (DocumentChunker.Chunk part : chunker.splitDetailed(strategy, block.text())) {
                DocumentChunk chunk = new DocumentChunk();
                chunk.setDocumentId(document.getId());
                chunk.setChunkIndex(index++);
                chunk.setContent(part.text());
                chunk.setTokenCount(part.tokenCount());
                chunk.setContentHash(sha256(part.text()));
                chunk.setPageNumber(block.pageNumber());
                chunk.setSectionPath(block.section());
                chunk.setBlockType(block.type() == null ? "TEXT" : block.type().name());
                chunk.setMetadata(json.valueToTree(block.metadata()));
                chunk.setJobId(jobId);
                planned.add(new PlannedChunk(chunk, part.text()));
            }
        }
        return planned;
    }

    private Flattened collectDocument(
            DocumentParser.ParsedDocument parsed,
            KnowledgeDocument document,
            KnowledgeBase base,
            List<String> inheritedWarnings,
            List<String> path,
            int depth) {
        List<DocumentParser.ParsedBlock> blocks = new ArrayList<>(parsed.blocks());
        List<DocumentParser.ParsedAsset> assets = new ArrayList<>(parsed.assets());
        List<String> warnings = new ArrayList<>(inheritedWarnings);
        warnings.addAll(parsed.warnings());
        if (depth >= 2) {
            if (!parsed.assets().isEmpty()) warnings.add("内嵌附件递归层级超过限制，部分内容未解析");
            return new Flattened(blocks, assets, warnings);
        }

        int processed = 0;
        for (DocumentParser.ParsedAsset asset : parsed.assets()) {
            if (asset.kind() != DocumentParser.AssetKind.ATTACHMENT) continue;
            if (processed++ >= 50) {
                warnings.add("内嵌附件数量超过 50，后续附件未解析");
                break;
            }
            String name = asset.name() == null ? "attachment" : asset.name();
            if (!parsers.supports(name)) {
                warnings.add("内嵌附件 " + name + " 的格式暂不支持解析");
                continue;
            }
            try {
                DocumentParser parser = parsers.forFilename(name);
                DocumentParser.ParsedDocument child = parser.parseDocument(asset.bytes());
                List<String> childPath = new ArrayList<>(path);
                childPath.add(name);
                Flattened nested =
                        collectDocument(
                                child,
                                document,
                                base,
                                warnings,
                                childPath,
                                depth + 1);
                blocks.addAll(prefixSections(nested.blocks(), String.join(" / ", childPath)));
                assets.addAll(nested.assets());
                warnings = nested.warnings();
            } catch (Exception error) {
                warnings.add(
                        "内嵌附件 "
                                + name
                                + " 解析失败："
                                + (error.getMessage() == null
                                        ? error.getClass().getSimpleName()
                                        : error.getMessage()));
            }
        }
        return new Flattened(blocks, assets, warnings);
    }

    private List<DocumentParser.ParsedBlock> prefixSections(
            List<DocumentParser.ParsedBlock> blocks, String prefix) {
        List<DocumentParser.ParsedBlock> out = new ArrayList<>();
        for (DocumentParser.ParsedBlock block : blocks) {
            String section =
                    block.section() == null || block.section().isBlank()
                            ? prefix
                            : prefix + " / " + block.section();
            out.add(
                    new DocumentParser.ParsedBlock(
                            block.type(),
                            block.pageNumber(),
                            section,
                            block.text(),
                            block.metadata()));
        }
        return out;
    }

    private void replaceAssets(
            KnowledgeDocument document,
            List<DocumentParser.ParsedAsset> assets,
            String jobId,
            List<String> warnings) {
        for (DocumentParser.ParsedAsset asset : assets) {
            if (asset.bytes() == null || asset.bytes().length == 0) continue;
            KnowledgeDocumentAsset record = new KnowledgeDocumentAsset();
            record.setDocumentId(document.getId());
            record.setAssetKind(asset.kind() == null ? "ATTACHMENT" : asset.kind().name());
            record.setName(asset.name());
            record.setMediaType(asset.mediaType());
            record.setPageNumber(asset.pageNumber());
            record.setSectionPath(asset.section());
            record.setExtractedText(asset.extractedText());
            record.setJobId(jobId);
            record.setMetadata(json.valueToTree(asset.metadata()));
            try {
                DocumentStorage.StoredObject stored =
                        storage.store(
                                document.getKnowledgeBaseId(),
                                document.getId() + "-" + record.getId(),
                                asset.name() == null ? "asset" : asset.name(),
                                asset.bytes());
                record.setStorageBackend(storage.backend());
                record.setStorageKey(stored.key());
                record.setSha256(stored.sha256());
                record.setByteSize(stored.byteSize());
                assetRecords.save(record);
            } catch (Exception error) {
                warnings.add(
                        "附件 "
                                + (asset.name() == null ? "asset" : asset.name())
                                + " 存储失败："
                                + error.getMessage());
            }
        }
        for (KnowledgeDocumentAsset previous : assetRecords.findAllByDocumentId(document.getId())) {
            if (jobId.equals(previous.getJobId())) continue;
            deleteAssetObject(previous);
            assetRecords.deleteById(previous.getId());
        }
    }

    private void applyDocumentStats(
            KnowledgeDocument document, ParsedSource source, Flattened flattened) {
        int pageCount = 0;
        int tableCount = 0;
        int imageBlocks = 0;
        int attachmentBlocks = 0;
        long characters = 0;
        for (DocumentParser.ParsedBlock block : flattened.blocks()) {
            if (block.pageNumber() != null) pageCount = Math.max(pageCount, block.pageNumber());
            if (block.type() == DocumentParser.BlockType.TABLE) tableCount++;
            if (block.type() == DocumentParser.BlockType.IMAGE) imageBlocks++;
            if (block.type() == DocumentParser.BlockType.ATTACHMENT) attachmentBlocks++;
            if (block.text() != null) characters += block.text().length();
        }
        int imageAssets =
                (int)
                        flattened.assets().stream()
                                .filter(
                                        asset ->
                                                asset.kind()
                                                        == DocumentParser.AssetKind.IMAGE)
                                .count();
        int attachmentAssets =
                (int)
                        flattened.assets().stream()
                                .filter(
                                        asset ->
                                                asset.kind()
                                                        == DocumentParser.AssetKind.ATTACHMENT)
                                .count();
        document.setPageCount(
                number(source.document().metadata().get("pageCount"))
                        .or(() -> number(source.document().metadata().get("slideCount")))
                        .orElse(pageCount == 0 ? null : pageCount));
        document.setBlockCount(flattened.blocks().size());
        document.setTableCount(tableCount);
        document.setImageCount(Math.max(imageBlocks, imageAssets));
        document.setAttachmentCount(Math.max(attachmentBlocks, attachmentAssets));
        document.setExtractedChars(characters);
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("parser", source.parserId());
        metadata.putAll(source.document().metadata());
        metadata.put("warnings", flattened.warnings());
        document.setParseMetadata(json.valueToTree(metadata));
    }

    private java.util.Optional<Integer> number(Object value) {
        if (value instanceof Number number) return java.util.Optional.of(number.intValue());
        if (value == null) return java.util.Optional.empty();
        try {
            return java.util.Optional.of(Integer.parseInt(value.toString()));
        } catch (NumberFormatException ignored) {
            return java.util.Optional.empty();
        }
    }

    private void deleteAssetObject(KnowledgeDocumentAsset asset) {
        if (asset.getStorageKey() == null || asset.getStorageKey().isBlank()) return;
        try {
            storage.delete(asset.getStorageKey());
        } catch (Exception ignored) {
            // The database row is still removed so a missing object cannot block cleanup.
        }
    }

    private String sha256(String value) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(digest.length * 2);
            for (byte item : digest) out.append(String.format("%02x", item));
            return out.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("无法计算分块指纹", error);
        }
    }

    private String resolveStrategy(KnowledgeBase base, KnowledgeDocument document) {
        if (document.getChunkStrategy() != null && !document.getChunkStrategy().isBlank())
            return document.getChunkStrategy();
        if (base.getChunkStrategy() != null && !base.getChunkStrategy().isBlank())
            return base.getChunkStrategy();
        return chunker.defaultStrategy();
    }

    private void advance(
            KnowledgeDocument document, String status, IntConsumer progress, int value) {
        document.setStatus(status);
        document.touch();
        documents.save(document);
        progress.accept(value);
    }

    private void storeEmbedding(
            DocumentChunk chunk,
            KnowledgeBase base,
            EmbeddingProfile profile,
            List<Double> vector) {
        String table = schema.tableFor(profile.getDimension());
        String cast = schema.castFor(profile.getDimension());
        jdbc.update(
                "INSERT INTO "
                        + table
                        + " (chunk_id, knowledge_base_id, embedding_profile_id, config_version, embedding) VALUES (?, ?, ?, ?, "
                        + cast
                        + ")"
                        + " ON CONFLICT (chunk_id) DO UPDATE SET embedding = EXCLUDED.embedding, embedding_profile_id = EXCLUDED.embedding_profile_id, config_version = EXCLUDED.config_version",
                chunk.getId(),
                base.getId(),
                profile.getId(),
                profile.getConfigVersion(),
                EmbeddingClient.literal(vector));
    }

    private record ParsedSource(String parserId, DocumentParser.ParsedDocument document) {}

    private record PlannedChunk(DocumentChunk chunk, String text) {}

    private record Flattened(
            List<DocumentParser.ParsedBlock> blocks,
            List<DocumentParser.ParsedAsset> assets,
            List<String> warnings) {}
}
