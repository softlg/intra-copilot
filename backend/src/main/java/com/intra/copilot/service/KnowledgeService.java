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
    private final int chunkSize;
    private final int chunkOverlap;
    private final long maxDocumentBytes;
    private final double similarityThreshold;

    public KnowledgeService(KnowledgeBaseRepository bases, KnowledgeDocumentRepository documents,
            DocumentChunkRepository chunks, JdbcTemplate jdbc, EmbeddingClient embeddings,
            @Value("${rag.chunk-size:1200}") int chunkSize,
            @Value("${rag.chunk-overlap:200}") int chunkOverlap,
            @Value("${rag.max-document-bytes:10485760}") long maxDocumentBytes,
            @Value("${rag.similarity-threshold:0.65}") double similarityThreshold) {
        this.bases = bases; this.documents = documents; this.chunks = chunks; this.jdbc = jdbc; this.embeddings = embeddings;
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

    @Transactional
    public KnowledgeDocument upload(String baseId, MultipartFile file) throws IOException {
        KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
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
                var vector = embeddings.embed(part);
                jdbc.update("UPDATE document_chunk SET embedding = ?::vector WHERE id = ?", EmbeddingClient.literal(vector), chunk.getId());
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
        document.setStatus("INDEXING"); document.setError(null); document.touch(); documents.save(document);
        chunks.deleteAllByDocumentId(id);
        try {
            int index = 0;
            for (String part : splitStructured(document.getContent(), null)) {
                DocumentChunk chunk = new DocumentChunk(); chunk.setDocumentId(id); chunk.setChunkIndex(index++); chunk.setContent(part); chunks.save(chunk);
                var vector = embeddings.embed(part);
                jdbc.update("UPDATE document_chunk SET embedding = ?::vector WHERE id = ?", EmbeddingClient.literal(vector), chunk.getId());
            }
            document.setStatus("READY");
        } catch (Exception error) {
            document.setStatus("ERROR"); document.setError(error.getMessage());
        }
        document.touch();
        return documents.save(document);
    }

    @Override public List<Result> search(String query, List<String> ids, int topK) {
        if (query == null || query.isBlank() || ids == null || ids.isEmpty()) return List.of();
        try {
            String vector = EmbeddingClient.literal(embeddings.embed(query));
            String placeholders = String.join(",", ids.stream().map(x -> "?").toList());
            List<Object> params = new ArrayList<>(); params.add(vector); params.addAll(ids); params.add(vector); params.add(similarityThreshold); params.add(vector); params.add(Math.max(1, Math.min(topK, 20)));
            return jdbc.query("SELECT c.document_id,d.filename,c.page_number,c.content,(c.embedding <=> ?::vector) AS distance FROM document_chunk c JOIN knowledge_document d ON d.id=c.document_id JOIN knowledge_base b ON b.id=d.knowledge_base_id WHERE d.knowledge_base_id IN ("+placeholders+") AND b.enabled = TRUE AND d.status = 'READY' AND c.embedding IS NOT NULL AND (1 - (c.embedding <=> ?::vector)) >= ? ORDER BY c.embedding <=> ?::vector LIMIT ?", params.toArray(), (rs, n) -> new Result(rs.getString("document_id"), rs.getString("filename"), (Integer) rs.getObject("page_number"), rs.getString("content"), rs.getDouble("distance")));
        } catch (Exception ignored) { return List.of(); }
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
    private String normalizeName(String value) { if (value == null || value.isBlank()) throw new IllegalArgumentException("知识库名称不能为空"); return value.trim(); }
    private void ensureNameAvailable(String name, String excludingId) {
        boolean duplicate = bases.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId) && item.getName() != null && item.getName().trim().equalsIgnoreCase(name));
        if (duplicate) throw new IllegalArgumentException("知识库名称已存在");
    }
    private record InMemoryMultipartFile(String name, String contentType, byte[] data) implements MultipartFile {
        public String getName() { return name; } public String getOriginalFilename() { return name; } public String getContentType() { return contentType; } public boolean isEmpty() { return data.length == 0; } public long getSize() { return data.length; } public byte[] getBytes() { return data; } public java.io.InputStream getInputStream() { return new java.io.ByteArrayInputStream(data); } public void transferTo(java.io.File dest) throws IOException { java.nio.file.Files.write(dest.toPath(), data); }
    }
}
