package com.intra.copilot.application.knowledge;

import java.util.List;

public interface KnowledgeRetriever {
    List<KnowledgeRetriever.Result> search(String query, List<String> knowledgeBaseIds, int topK);

    record Result(
            String chunkId,
            String documentId,
            String filename,
            Integer pageNumber,
            int chunkIndex,
            String sectionPath,
            String blockType,
            Integer tokenCount,
            String content,
            double distance,
            double similarity,
            double lexicalScore,
            double score,
            String retrievalMode,
            boolean belowThreshold,
            int rank) {

        public Result(
                String documentId, String filename, Integer pageNumber, String content, double distance) {
            this(
                    null,
                    documentId,
                    filename,
                    pageNumber,
                    0,
                    null,
                    "TEXT",
                    null,
                    content,
                    distance,
                    1 - distance,
                    0,
                    1 - distance,
                    "DENSE",
                    false,
                    0);
        }
    }
}
