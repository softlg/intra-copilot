package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class DocumentChunkerTest {

    private final DocumentChunker chunker = new DocumentChunker(200, 50, 100);

    @Test
    void returnsNothingForBlankInput() {
        assertTrue(chunker.split("structured", null).isEmpty());
        assertTrue(chunker.split("structured", "   ").isEmpty());
    }

    @Test
    void keepsSmallDocumentsWhole() {
        List<String> chunks = chunker.split("structured", "一段很短的说明文本。");
        assertEquals(1, chunks.size());
        assertEquals("一段很短的说明文本。", chunks.get(0));
    }

    @Test
    void splitsLongDocumentsAndRespectsSize() {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 40; i++) {
            text.append("段落 ").append(i).append("：").append("内容".repeat(20)).append("\n\n");
        }
        List<String> chunks = chunker.split("structured", text.toString());
        assertTrue(chunks.size() > 1, "长文档应被切分为多个分块");
        for (String chunk : chunks) {
            assertTrue(chunk.length() <= 200 + 200, "分块长度不应无限增长：" + chunk.length());
        }
    }

    @Test
    void fallsBackToUnknownStrategy() {
        assertEquals(1, chunker.split("not-configured-yet", "短文本").size());
    }

    @Test
    void hardSplitsASingleOversizedBlock() {
        String text = "这是一个没有空段落的长文本。".repeat(200);

        List<DocumentChunker.Chunk> chunks = chunker.splitDetailed("structured", text);

        assertTrue(chunks.size() > 1);
        assertTrue(
                chunks.stream().allMatch(chunk -> chunk.text().length() <= 200), "每个分块都应遵守字符硬上限");
        assertTrue(
                chunks.stream().allMatch(chunk -> chunk.tokenCount() <= 100), "每个分块都应遵守 token 硬上限");
    }

    @Test
    void estimatesChineseAndAsciiWithDifferentDensities() {
        assertTrue(chunker.estimateTokens("中文内容") >= 4);
        assertTrue(chunker.estimateTokens("abcdefgh") <= 4);
    }
}
