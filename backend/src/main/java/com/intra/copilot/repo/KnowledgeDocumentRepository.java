package com.intra.copilot.repo;

import com.intra.copilot.model.KnowledgeDocument;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface KnowledgeDocumentRepository extends JpaRepository<KnowledgeDocument, String> {
  List<KnowledgeDocument> findAllByKnowledgeBaseIdOrderByCreatedAtDesc(String knowledgeBaseId);
}
