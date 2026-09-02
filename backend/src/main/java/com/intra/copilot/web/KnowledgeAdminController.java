package com.intra.copilot.web;

import com.intra.copilot.model.KnowledgeBase;
import com.intra.copilot.model.KnowledgeDocument;
import com.intra.copilot.service.KnowledgeService;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/admin/knowledge-bases")
public class KnowledgeAdminController {
  private final KnowledgeService service;
  public KnowledgeAdminController(KnowledgeService service) { this.service = service; }
  @GetMapping public List<KnowledgeBase> list() { return service.listBases(); }
  @PostMapping @ResponseStatus(HttpStatus.CREATED) public KnowledgeBase create(@RequestBody KnowledgeBase b) { if (b.getName() == null || b.getName().isBlank()) throw new IllegalArgumentException("知识库名称不能为空"); return service.createBase(b); }
  @PutMapping("/{id}") public KnowledgeBase update(@PathVariable String id, @RequestBody KnowledgeBase b) { return service.updateBase(id, b); }
  @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable String id) { service.deleteBase(id); }
  @GetMapping("/{id}/documents") public List<KnowledgeDocument> documents(@PathVariable String id) { return service.listDocuments(id); }
  @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE) public KnowledgeDocument upload(@PathVariable String id, @RequestPart("file") MultipartFile file) throws IOException { return service.upload(id, file); }
  @PostMapping("/documents/{documentId}/reindex") public KnowledgeDocument reindex(@PathVariable String documentId) throws IOException { return service.reindex(documentId); }
  @DeleteMapping("/documents/{documentId}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteDocument(@PathVariable String documentId) { service.deleteDocument(documentId); }
}
