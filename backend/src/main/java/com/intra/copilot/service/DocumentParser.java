package com.intra.copilot.service;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Turns raw document bytes into page-ish text units.
 *
 * <p>Adding a format means adding one implementation of this interface; the registry picks it up
 * automatically. Office/HTML/CSV/OCR parsers can therefore land later without touching the indexing
 * pipeline.
 */
public interface DocumentParser {

    /** Stable identifier persisted on the document ({@code knowledge_document.parser}). */
    String id();

    boolean supports(String filename);

    List<PageText> parse(byte[] bytes) throws IOException;

    /**
     * Structured parser entry point. Existing parsers can keep implementing {@link #parse(byte[])}
     * while formats with headings, tables, images and attachments return richer blocks.
     */
    default ParsedDocument parseDocument(byte[] bytes) throws IOException {
        return new ParsedDocument(
                parse(bytes)
                        .stream()
                        .map(
                                page ->
                                        new ParsedBlock(
                                                BlockType.TEXT,
                                                page.pageNumber(),
                                                page.section(),
                                                page.text(),
                                                Map.of()))
                        .toList(),
                List.of(),
                Map.of(),
                List.of());
    }

    /**
     * @param pageNumber page/slide/row index when the format has one, {@code null} otherwise
     * @param section heading, sheet name or slide title when available
     * @param text extracted text of this unit
     */
    record PageText(Integer pageNumber, String section, String text) {}

    enum BlockType {
        TEXT,
        HEADING,
        TABLE,
        CODE,
        IMAGE,
        ATTACHMENT
    }

    enum AssetKind {
        IMAGE,
        ATTACHMENT
    }

    record ParsedBlock(
            BlockType type,
            Integer pageNumber,
            String section,
            String text,
            Map<String, Object> metadata) {}

    record ParsedAsset(
            AssetKind kind,
            String name,
            String mediaType,
            byte[] bytes,
            Integer pageNumber,
            String section,
            String extractedText,
            Map<String, Object> metadata) {}

    record ParsedDocument(
            List<ParsedBlock> blocks,
            List<ParsedAsset> assets,
            Map<String, Object> metadata,
            List<String> warnings) {}
}
