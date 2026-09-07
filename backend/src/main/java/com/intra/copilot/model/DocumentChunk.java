package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.util.UUID;

@TableName("document_chunk")
public class DocumentChunk {
  @TableId private String id = UUID.randomUUID().toString();
  private String documentId;
  private int chunkIndex;
  private String content;
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
