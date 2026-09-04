package com.intra.copilot.service;

import com.intra.copilot.model.DocumentChunk;
import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.repo.DocumentChunkRepository;
import com.intra.copilot.repo.KnowledgeBaseRepository;
import com.intra.copilot.repo.KnowledgeDocumentRepository;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
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

  public KnowledgeService(KnowledgeBaseRepository bases, KnowledgeDocumentRepository documents,
      DocumentChunkRepository chunks, JdbcTemplate jdbc, EmbeddingClient embeddings) {
    this.bases = bases; this.documents = documents; this.chunks = chunks; this.jdbc = jdbc; this.embeddings = embeddings;
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

  @Transactional
  public KnowledgeDocument upload(String baseId, MultipartFile file) throws IOException {
    KnowledgeBase base = bases.findById(baseId).orElseThrow(() -> new IllegalArgumentException("知识库不存在"));
    String name = file.getOriginalFilename() == null ? "document" : file.getOriginalFilename();
    String lower = name.toLowerCase(Locale.ROOT);
    if (!(lower.endsWith(".md") || lower.endsWith(".txt") || lower.endsWith(".pdf"))) throw new IllegalArgumentException("仅支持 Markdown、TXT 或 PDF");
    String content = lower.endsWith(".pdf") ? extractPdf(file.getBytes()) : new String(file.getBytes(), StandardCharsets.UTF_8);
    KnowledgeDocument doc = new KnowledgeDocument(); doc.setKnowledgeBaseId(base.getId()); doc.setFilename(name); doc.setMediaType(file.getContentType()); doc.setContent(content); doc.setStatus("INDEXING"); doc = documents.save(doc);
    chunks.deleteAllByDocumentId(doc.getId());
    int index = 0;
    for (String part : split(content, 1200)) {
      DocumentChunk chunk = new DocumentChunk(); chunk.setDocumentId(doc.getId()); chunk.setChunkIndex(index++); chunk.setContent(part); chunks.save(chunk);
      try { var vector = embeddings.embed(part); jdbc.update("UPDATE document_chunk SET embedding = ?::vector WHERE id = ?", EmbeddingClient.literal(vector), chunk.getId()); }
      catch (Exception e) { doc.setStatus("ERROR"); doc.setError(e.getMessage()); documents.save(doc); return doc; }
    }
    doc.setStatus("READY"); doc.touch(); return documents.save(doc);
  }

  @Transactional public void deleteDocument(String id) { documents.deleteById(id); }
  public KnowledgeDocument reindex(String id) throws IOException { KnowledgeDocument d = documents.findById(id).orElseThrow(); byte[] bytes = d.getContent().getBytes(StandardCharsets.UTF_8); MultipartFile file = new InMemoryMultipartFile(d.getFilename(), d.getMediaType(), bytes); documents.deleteById(id); return upload(d.getKnowledgeBaseId(), file); }

  @Override public List<Result> search(String query, List<String> ids, int topK) {
    if (query == null || query.isBlank() || ids == null || ids.isEmpty()) return List.of();
    try {
      String vector = EmbeddingClient.literal(embeddings.embed(query));
      String placeholders = String.join(",", ids.stream().map(x -> "?").toList());
      List<Object> params = new ArrayList<>(); params.add(vector); params.addAll(ids); params.add(vector); params.add(Math.max(1, Math.min(topK, 20)));
      return jdbc.query("SELECT c.document_id,d.filename,c.page_number,c.content,(c.embedding <=> ?::vector) AS distance FROM document_chunk c JOIN knowledge_document d ON d.id=c.document_id WHERE d.knowledge_base_id IN ("+placeholders+") AND c.embedding IS NOT NULL ORDER BY c.embedding <=> ?::vector LIMIT ?", params.toArray(), (rs, n) -> new Result(rs.getString("document_id"), rs.getString("filename"), (Integer) rs.getObject("page_number"), rs.getString("content"), rs.getDouble("distance")));
    } catch (Exception ignored) { return List.of(); }
  }

  private String extractPdf(byte[] bytes) throws IOException { try (var pdf = Loader.loadPDF(bytes)) { return new PDFTextStripper().getText(pdf); } }
  private List<String> split(String text, int size) { List<String> out = new ArrayList<>(); if (text == null) return out; for (int i=0; i<text.length(); i+=size) out.add(text.substring(i, Math.min(text.length(), i+size))); return out; }
  private String normalizeName(String value) { if (value == null || value.isBlank()) throw new IllegalArgumentException("知识库名称不能为空"); return value.trim(); }
  private void ensureNameAvailable(String name, String excludingId) {
    boolean duplicate = bases.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId) && item.getName() != null && item.getName().trim().equalsIgnoreCase(name));
    if (duplicate) throw new IllegalArgumentException("知识库名称已存在");
  }
  private record InMemoryMultipartFile(String name, String contentType, byte[] data) implements MultipartFile {
    public String getName() { return name; } public String getOriginalFilename() { return name; } public String getContentType() { return contentType; } public boolean isEmpty() { return data.length == 0; } public long getSize() { return data.length; } public byte[] getBytes() { return data; } public java.io.InputStream getInputStream() { return new java.io.ByteArrayInputStream(data); } public void transferTo(java.io.File dest) throws IOException { java.nio.file.Files.write(dest.toPath(), data); }
  }
}
