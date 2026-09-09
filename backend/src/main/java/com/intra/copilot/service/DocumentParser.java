package com.intra.copilot.service;

import java.io.IOException;
import java.util.List;

/**
 * Turns raw document bytes into page-ish text units.
 *
 * <p>Adding a format means adding one implementation of this interface; the registry
 * picks it up automatically. Office/HTML/CSV/OCR parsers can therefore land later
 * without touching the indexing pipeline.
 */
public interface DocumentParser {

    /** Stable identifier persisted on the document ({@code knowledge_document.parser}). */
    String id();

    boolean supports(String filename);

    List<PageText> parse(byte[] bytes) throws IOException;

    /**
     * @param pageNumber page/slide/row index when the format has one, {@code null} otherwise
     * @param section heading, sheet name or slide title when available
     * @param text extracted text of this unit
     */
    record PageText(Integer pageNumber, String section, String text) {}
}
