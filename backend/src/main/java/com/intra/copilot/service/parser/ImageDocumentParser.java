package com.intra.copilot.service.parser;

import com.intra.copilot.service.DocumentParser;
import com.intra.copilot.service.OcrService;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Standalone image documents, searchable only when OCR is configured. */
@Component
public class ImageDocumentParser implements DocumentParser {
    private final OcrService ocr;

    public ImageDocumentParser(OcrService ocr) {
        this.ocr = ocr;
    }

    @Override
    public String id() {
        return "image";
    }

    @Override
    public boolean supports(String filename) {
        return ocr.isEnabled() && ocr.supportsImage(filename);
    }

    @Override
    public List<PageText> parse(byte[] bytes) throws IOException {
        return parseDocument(bytes)
                .blocks()
                .stream()
                .map(block -> new PageText(block.pageNumber(), block.section(), block.text()))
                .toList();
    }

    @Override
    public ParsedDocument parseDocument(byte[] bytes) throws IOException {
        String name = "image";
        String text = ocr.recognize(bytes, null, name);
        List<ParsedBlock> blocks =
                text.isBlank()
                        ? List.of()
                        : List.of(
                                new ParsedBlock(
                                        BlockType.TEXT,
                                        null,
                                        null,
                                        text,
                                        Map.of("source", "ocr", "format", "image")));
        List<ParsedAsset> assets =
                List.of(
                        new ParsedAsset(
                                AssetKind.IMAGE,
                                name,
                                null,
                                bytes,
                                null,
                                null,
                                text,
                                Map.of("source", "standalone-image")));
        List<String> warnings = text.isBlank() ? List.of("OCR 未识别到可索引文本") : List.of();
        return new ParsedDocument(blocks, assets, Map.of("ocrEnabled", true), warnings);
    }
}
