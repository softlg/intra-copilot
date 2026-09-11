package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RetrievalTextScorerTest {

    @Test
    void matchesChineseQueryAgainstEquivalentPdfText() {
        String query = "合并生成报关";
        String content = "1. 合并⽣成报关任务\n宏：TMS_SP_GENERATE_DT_MERGE";

        assertTrue(RetrievalTextScorer.score(query, content) > 0.9);
    }

    @Test
    void prioritizesExactAsciiIdentifiers() {
        String query = "TMS_SP_GENERATE_DT_MERGE";
        String content = "宏：TMS_SP_GENERATE_DT_MERGE -> 函数维护";

        assertEquals(1.0, RetrievalTextScorer.score(query, content), 0.0001);
    }

    @Test
    void returnsZeroForUnrelatedText() {
        assertEquals(0.0, RetrievalTextScorer.score("关税税率", "提货单和出库清单"), 0.0001);
    }
}
