package com.intra.copilot.repo;
import com.intra.copilot.model.DocumentChunk;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, String> { void deleteAllByDocumentId(String documentId); List<DocumentChunk> findAllByDocumentIdOrderByChunkIndex(String documentId); }
