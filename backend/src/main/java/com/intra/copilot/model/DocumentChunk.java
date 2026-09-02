package com.intra.copilot.model;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "document_chunk")
public class DocumentChunk {
  @Id private String id = UUID.randomUUID().toString();
  private String documentId;
  private int chunkIndex;
  @Lob private String content;
  private Integer pageNumber;

  public String getId() { return id; }
  public String getDocumentId() { return documentId; }
  public void setDocumentId(String value) { documentId = value; }
  public int getChunkIndex() { return chunkIndex; }
  public void setChunkIndex(int value) { chunkIndex = value; }
  public String getContent() { return content; }
  public void setContent(String value) { content = value; }
  public Integer getPageNumber() { return pageNumber; }
  public void setPageNumber(Integer value) { pageNumber = value; }
}
