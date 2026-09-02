package com.intra.copilot.service;

import java.util.List;

public interface KnowledgeRetriever {
  List<KnowledgeRetriever.Result> search(String query, List<String> knowledgeBaseIds, int topK);

  record Result(String documentId, String filename, Integer pageNumber, String content, double distance) {}
}
