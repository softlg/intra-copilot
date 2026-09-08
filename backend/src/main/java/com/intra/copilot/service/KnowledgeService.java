package com.intra.copilot.service;

import com.intra.copilot.model.DocumentChunk;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.repo.DocumentChunkRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.KnowledgeDocumentRepository;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class KnowledgeService implements KnowledgeRetriever {
        private final KnowledgeBaseRepository bases;
        private final KnowledgeDocumentRepository documents;
        private final DocumentChunkRepository chunks;
        private final JdbcTemplate jdbc;
        private final EmbeddingClient embeddings;
        private final EmbeddingProfileService embeddingProfiles;
        private final int chunkSize;
        private final int chunkOverlap;
        private final long maxDocumentBytes;
        private final double similarityThreshold;

        public KnowledgeService(KnowledgeBaseRepository bases, KnowledgeDocumentRepository documents,
                        DocumentChunkRepository chunks, JdbcTemplate jdbc, EmbeddingClient embeddings, EmbeddingProfileService embeddingProfiles,
                        @Value("${rag.chunk-size:1200}") int chunkSize,
                        @Value("${rag.chunk-overlap:200}") int chunkOverlap,
                        @Value("${rag.max-document-bytes:10485760}") long maxDocumentBytes,
                        @Value("${rag.similarity-threshold:0.65}") double similarityThreshold) {
                this.bases = bases; this.documents = documents; this.chunks = chunks; this.jdbc = jdbc; this.embeddings = embeddings; this.embeddingProfiles = embeddingProfiles;
                this.chunkSize = Math.max(200, chunkSize);
                this.chunkOverlap = Math.max(0, Math.min(this.chunkSize / 2, chunkOverlap));
                this.maxDocumentBytes = Math.max(1, maxDocumentBytes);
                this.similarityThreshold = Math.max(0, Math.min(2, similarityThreshold));
        }

        public List<KnowledgeBase> listBases() { return bases.findAll(); }
        public KnowledgeBase createBase(KnowledgeBase base) {
                String name = normalizeName(base.getName());
                ensureNameAvailable(name, null);
                base.setName(name);
                if (base.getId() == null || base.getId().isBlank()) base.setId(UUID.randomUUID().toString());
                return bases.save(base);
        }
        public KnowledgeBase updateBase(String id, KnowledgeBase value) {
                KnowledgeBase b = bases.findById(id).orElseThrow();
                String name = normalizeName(value.getName());
                ensureNameAvailable(name, id);
                b.setName(name); b.setDescription(value.getDescription()); b.setEnabled(value.isEnabled()); b.touch(); return bases.save(b);
        }
        public void deleteBase(String id) { bases.deleteById(id); }
        public List<KnowledgeDocument> listDocuments(String baseId) { return documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(baseId); }
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
                var profile = embeddingProfiles.resolve(base);
                String table = embeddingTable(profile.getDimension());
                boolean tableExists = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?)", Boolean.class, table));
                long documentsCount = documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(baseId).size();
                long errorCount = documents.findAllByKnowledgeBaseIdOrderByCreatedAtDesc(baseId).stream().filter(d -> "ERROR".equals(d.getStatus())).count();
                List<String> issues = new ArrayList<>();
                if (!tableExists) issues.add("EMBEDDING_TABLE_MISSING");
                if (errorCount > 0) issues.add("DOCUMENT_INDEXING_ERROR");
                if (tableExists) {
                        Long missing = jdbc.queryForObject("SELECT COUNT(*) FROM document_chunk c JOIN knowledge_document d ON d.id = c.document_id LEFT JOIN " + table + " e ON e.chunk_id = c.id WHERE d.knowledge_base_id = ? AND e.chunk_id IS NULL", Long.class, baseId);
                        if (missing != null && missing > 0) issues.add("READY_DOCUMENT_WITHOUT_VECTOR");
                }
                return new Diagnostics(baseId, profile.getProvider(), profile.getModel(), profile.getDimension(), tableExists, documentsCount, errorCount, issues);
        }

        public record Diagnostics(String knowledgeBaseId, String provider, String model, int dimension, boolean embeddingTableExists, long documentCount, long errorCount, List<String> issues) {}

        @Transactional
        public KnowledgeDocument upload(String baseId, MultipartFile file) throws IOException {
                KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
                var embeddingProfile = embeddingProfiles.resolve(base);
                if (file == null || file.isEmpty()) throw new IllegalArgumentException("上传文件不能为空");
                if (file.getSize() > maxDocumentBytes) throw new IllegalArgumentException("文件大小超过限制（最大 " + maxDocumentBytes + " 字节）");
                byte[] bytes = file.getBytes();
                String name = file.getOriginalFilename() == null ? "document" : file.getOriginalFilename();
                name = java.nio.file.Paths.get(name).getFileName().toString();
                String lower = name.toLowerCase(Locale.ROOT);
                if (!(lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".pdf"))) throw new IllegalArgumentException("仅支持 Markdown、TXT 或 PDF");
                validateMediaType(lower, file.getContentType());
                validateContentSignature(lower, bytes);
                String hash = sha256(bytes);
                var existing = documents.findByKnowledgeBaseIdAndFileHash(base.getId(), hash);
                if (existing.isPresent()) throw new IllegalArgumentException("文件已存在：" + name);
                KnowledgeDocument doc = new KnowledgeDocument();
                doc.setKnowledgeBaseId(base.getId());
                doc.setFilename(name);
                doc.setMediaType(file.getContentType());
                doc.setFileHash(hash);
                doc.setSizeBytes(file.getSize());
                doc.setStatus("PARSING");
                doc = documents.save(doc);
                try {
                        List<PageText> pages = lower.endsWith(".pdf") ? extractPdfPages(bytes) : List.of(new PageText(null, new String(bytes, StandardCharsets.UTF_8)));
                        String content = pages.stream().map(PageText::text).reduce("", (a, b) -> a + (a.isEmpty() ? "" : "\n\n") + b);
                        doc.setContent(content);
                        doc.setStatus("INDEXING");
                        documents.save(doc);
                        chunks.deleteAllByDocumentId(doc.getId());
                        int index = 0;
                        for (PageText page : pages) for (String part : splitStructured(page.text(), page.pageNumber())) {
                                DocumentChunk chunk = new DocumentChunk(); chunk.setDocumentId(doc.getId()); chunk.setChunkIndex(index++); chunk.setContent(part); chunk.setPageNumber(page.pageNumber()); chunks.save(chunk);
                                storeEmbedding(chunk, base, embeddingProfile);
                        }
                        doc.setStatus("READY");
                } catch (Exception error) {
                        doc.setStatus("ERROR");
                        doc.setError(error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
                }
                doc.touch();
                return documents.save(doc);
        }

        @Transactional
        public List<KnowledgeDocument> upload(String baseId, MultipartFile[] files) throws IOException {
                if (files == null || files.length == 0) throw new IllegalArgumentException("上传文件不能为空");
                List<KnowledgeDocument> result = new ArrayList<>();
                for (MultipartFile file : files) result.add(upload(baseId, file));
                return result;
        }

        @Transactional public void deleteDocument(String id) { documents.deleteById(id); }
        @Transactional
        public KnowledgeDocument reindex(String id) {
                KnowledgeDocument document = documents.findById(id).orElseThrow(() -> new IllegalArgumentException("文档不存在"));
                KnowledgeBase base = bases.findById(document.getKnowledgeBaseId()).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
                var embeddingProfile = embeddingProfiles.resolve(base);
                document.setStatus("INDEXING"); document.setError(null); document.touch(); documents.save(document);
                try {
                        List<PreparedChunk> prepared = new ArrayList<>(); int index = 0;
                        for (String part : splitStructured(document.getContent(), null)) { DocumentChunk chunk = new DocumentChunk(); chunk.setDocumentId(id); chunk.setChunkIndex(index++); chunk.setContent(part); prepared.add(new PreparedChunk(chunk, embeddings.embed(part, embeddingProfile))); }
                        chunks.deleteAllByDocumentId(id);
                        for (PreparedChunk item : prepared) { chunks.save(item.chunk()); storeEmbedding(item.chunk(), base, embeddingProfile, item.vector()); }
                        document.setStatus("READY");
                } catch (Exception error) {
                        document.setStatus("ERROR"); document.setError(error.getMessage());
                }
                document.touch();
                return documents.save(document);
        }

        @Override public List<Result> search(String query, List<String> ids, int topK) {
                if (query == null || query.isBlank() || ids == null || ids.isEmpty()) return List.of();
                List<RankedResult> ranked = new ArrayList<>();
                for (String id : ids) {
                        KnowledgeBase base = bases.findById(id).orElse(null); if (base == null || !base.isEnabled()) continue;
                        var profile = embeddingProfiles.resolve(base); String table = embeddingTable(profile.getDimension());
                        String cast = embeddingCast(profile.getDimension());
                        String vector = EmbeddingClient.literal(embeddings.embed(query, profile));
                        String sql = "SELECT c.document_id,d.filename,c.page_number,c.content,(e.embedding <=> " + cast + ") AS distance FROM document_chunk c JOIN knowledge_document d ON d.id=c.document_id JOIN " + table + " e ON e.chunk_id=c.id WHERE e.knowledge_base_id = ? AND d.status = 'READY' AND (1 - (e.embedding <=> " + cast + ")) >= ? ORDER BY e.embedding <=> " + cast + " LIMIT ?";
                        List<Result> local = jdbc.query(sql, new Object[]{vector, id, vector, similarityThreshold, vector, Math.max(1, Math.min(topK, 20))}, (rs, n) -> new Result(rs.getString("document_id"), rs.getString("filename"), (Integer) rs.getObject("page_number"), rs.getString("content"), rs.getDouble("distance")));
                        for (int rank = 0; rank < local.size(); rank++) ranked.add(new RankedResult(local.get(rank), 1.0 / (60 + rank + 1)));
                }
                ranked.sort(java.util.Comparator.comparingDouble(RankedResult::score).reversed());
                return ranked.stream().limit(Math.max(1, Math.min(topK, 20))).map(item -> new Result(item.result().documentId(), item.result().filename(), item.result().pageNumber(), item.result().content(), 1 - item.score())).toList();
        }

        private record RankedResult(Result result, double score) {}

        private void storeEmbedding(DocumentChunk chunk, KnowledgeBase base, com.intra.copilot.model.EmbeddingProfile profile) {
                String table = embeddingTable(profile.getDimension());
                var vector = embeddings.embed(chunk.getContent(), profile);
                storeEmbedding(chunk, base, profile, vector);
        }
        private void storeEmbedding(DocumentChunk chunk, KnowledgeBase base, com.intra.copilot.model.EmbeddingProfile profile, List<Double> vector) {
                String table = embeddingTable(profile.getDimension());
                String cast = embeddingCast(profile.getDimension());
                jdbc.update("INSERT INTO " + table + " (chunk_id, knowledge_base_id, embedding_profile_id, config_version, embedding) VALUES (?, ?, ?, ?, " + cast + ") ON CONFLICT (chunk_id) DO UPDATE SET embedding = EXCLUDED.embedding, embedding_profile_id = EXCLUDED.embedding_profile_id, config_version = EXCLUDED.config_version", chunk.getId(), base.getId(), profile.getId(), profile.getConfigVersion(), EmbeddingClient.literal(vector));
        }
        private String embeddingTable(int dimension) {
                return switch (dimension) { case 1024 -> "document_chunk_embedding_1024"; case 1536 -> "document_chunk_embedding_1536"; case 3072 -> "document_chunk_embedding_3072"; default -> throw new IllegalArgumentException("暂不支持的 Embedding 维度：" + dimension + "，请先添加对应数据库迁移"); };
        }
        /**
         * 根据 embedding 维度返回合适的 SQL 类型转换。3072 维的表用 halfvec 半精度类型存储
         * （pgvector 0.8.0 中 HNSW 索引对 vector 类型的硬上限为 2000 维，超过该值必须改用
         * halfvec，其 HNSW 索引上限为 4000 维）；其余维度仍用 vector。
         */
        private String embeddingCast(int dimension) {
                return dimension == 3072 ? "?::halfvec" : "?::vector";
        }

        private List<PageText> extractPdfPages(byte[] bytes) throws IOException { try (var pdf = Loader.loadPDF(bytes)) { List<PageText> out = new ArrayList<>(); PDFTextStripper stripper = new PDFTextStripper(); for (int page = 1; page <= pdf.getNumberOfPages(); page++) { stripper.setStartPage(page); stripper.setEndPage(page); String text = stripper.getText(pdf).trim(); if (!text.isBlank()) out.add(new PageText(page, text)); } return out; } }
        private List<String> splitStructured(String text, Integer pageNumber) { List<String> out = new ArrayList<>(); if (text == null || text.isBlank()) return out; String normalized = text.replace("\r\n", "\n").trim(); String[] blocks = normalized.split("\\n(?=\\s*#{1,6}\\s+)|\\n\\s*\\n"); StringBuilder current = new StringBuilder(); for (String block : blocks) { String part = block.trim(); if (part.isEmpty()) continue; if (current.length() > 0 && current.length() + part.length() + 2 > chunkSize) { out.add(current.toString()); String overlap = current.substring(Math.max(0, current.length() - chunkOverlap)); current = new StringBuilder(overlap); } if (current.length() > 0) current.append("\n\n"); current.append(part); } if (current.length() > 0) out.add(current.toString()); if (out.isEmpty()) out.add(normalized); return out; }
        private String sha256(byte[] bytes) { try { byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder out = new StringBuilder(); for (byte value : digest) out.append(String.format("%02x", value)); return out.toString(); } catch (NoSuchAlgorithmException e) { throw new IllegalStateException("无法计算文件指纹", e); } }
        private void validateContentSignature(String filename, byte[] bytes) {
                if (filename.endsWith(".pdf")) {
                        if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-') throw new IllegalArgumentException("文件内容不是有效的 PDF");
                        return;
                }
                for (byte value : bytes) if (value == 0) throw new IllegalArgumentException("文本文件包含不可识别的二进制内容");
        }
        private void validateMediaType(String filename, String mediaType) {
                if (mediaType == null || mediaType.isBlank() || "application/octet-stream".equalsIgnoreCase(mediaType)) return;
                boolean valid = filename.endsWith(".pdf") ? "application/pdf".equalsIgnoreCase(mediaType)
                                : ("text/plain".equalsIgnoreCase(mediaType) || "text/markdown".equalsIgnoreCase(mediaType) || "text/x-markdown".equalsIgnoreCase(mediaType));
                if (!valid) throw new IllegalArgumentException("文件类型与扩展名不匹配");
        }
        private record PageText(Integer pageNumber, String text) {}
        private record PreparedChunk(DocumentChunk chunk, List<Double> vector) {}
        private String normalizeName(String value) { if (value == null || value.isBlank()) throw new IllegalArgumentException("知识库名称不能为空"); return value.trim(); }
        private void ensureNameAvailable(String name, String excludingId) {
                boolean duplicate = bases.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId) && item.getName() != null && item.getName().trim().equalsIgnoreCase(name));
                if (duplicate) throw new IllegalArgumentException("知识库名称已存在");
        }
        private record InMemoryMultipartFile(String name, String contentType, byte[] data) implements MultipartFile {
                public String getName() { return name; } public String getOriginalFilename() { return name; } public String getContentType() { return contentType; } public boolean isEmpty() { return data.length == 0; } public long getSize() { return data.length; } public byte[] getBytes() { return data; } public java.io.InputStream getInputStream() { return new java.io.ByteArrayInputStream(data); } public void transferTo(java.io.File dest) throws IOException { java.nio.file.Files.write(dest.toPath(), data); }
        }
}
