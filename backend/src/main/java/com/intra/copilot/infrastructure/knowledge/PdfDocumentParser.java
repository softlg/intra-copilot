package com.intra.copilot.infrastructure.knowledge;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** PDF text extraction, one unit per non-empty page. */
@Component
public class PdfDocumentParser implements DocumentParser {
    private final OcrService ocr;
    private final int minTextCharacters;
    private final int maxAttachmentBytes;

    public PdfDocumentParser(
            OcrService ocr,
            @Value("${ocr.pdf-min-text-characters:80}") int minTextCharacters,
            @Value("${rag.max-embedded-attachment-bytes:20971520}") int maxAttachmentBytes) {
        this.ocr = ocr;
        this.minTextCharacters = Math.max(0, minTextCharacters);
        this.maxAttachmentBytes = Math.max(1024, maxAttachmentBytes);
    }

    @Override
    public String id() {
        return "pdf";
    }

    @Override
    public boolean supports(String filename) {
        return filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".pdf");
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
        try (var pdf = Loader.loadPDF(bytes)) {
            List<ParsedBlock> blocks = new ArrayList<>();
            List<ParsedAsset> assets = new ArrayList<>();
            List<String> warnings = new ArrayList<>();
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            PDFRenderer renderer = new PDFRenderer(pdf);
            for (int page = 1; page <= pdf.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String text = stripper.getText(pdf).trim();
                if (text.length() >= minTextCharacters) {
                    blocks.addAll(pageBlocks(page, text));
                    continue;
                }
                if (!text.isBlank()) blocks.addAll(pageBlocks(page, text));
                if (ocr.isEnabled()) {
                    BufferedImage image = renderer.renderImageWithDPI(page - 1, ocr.dpi());
                    byte[] png = png(image);
                    String recognized = ocr.recognize(png, "image/png", "page-" + page + ".png");
                    if (!recognized.isBlank()) {
                        blocks.add(
                                new ParsedBlock(
                                        BlockType.TEXT,
                                        page,
                                        null,
                                        recognized,
                                        Map.of("source", "ocr", "format", "pdf")));
                    }
                    assets.add(
                            new ParsedAsset(
                                    AssetKind.IMAGE,
                                    "page-" + page + ".png",
                                    "image/png",
                                    png,
                                    page,
                                    null,
                                    recognized,
                                    Map.of("source", "scanned-pdf-page")));
                } else if (text.isBlank()) {
                    warnings.add("第 " + page + " 页未提取到文本；启用 OCR 后可识别扫描内容");
                }
            }
            assets.addAll(embeddedAttachments(pdf, warnings));
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("pageCount", pdf.getNumberOfPages());
            metadata.put("ocrEnabled", ocr.isEnabled());
            if (!assets.isEmpty()) metadata.put("assetCount", assets.size());
            return new ParsedDocument(blocks, assets, metadata, warnings);
        }
    }

    private List<ParsedBlock> pageBlocks(int page, String text) {
        List<ParsedBlock> out = new ArrayList<>();
        String[] lines = text.replace("\r\n", "\n").split("\n");
        int index = 0;
        while (index < lines.length) {
            String line = lines[index].trim();
            if (line.isEmpty()) {
                index++;
                continue;
            }
            if (tableLike(line)) {
                int start = index;
                List<String> rows = new ArrayList<>();
                while (index < lines.length && tableLike(lines[index].trim())) {
                    rows.add(normalizeTableRow(lines[index].trim()));
                    index++;
                }
                if (rows.size() >= 2) {
                    out.add(
                            new ParsedBlock(
                                    BlockType.TABLE,
                                    page,
                                    null,
                                    String.join("\n", rows),
                                    Map.of("format", "pdf", "startLine", start + 1)));
                    continue;
                }
                index = start;
            }
            List<String> paragraph = new ArrayList<>();
            paragraph.add(lines[index].trim());
            index++;
            while (index < lines.length) {
                String next = lines[index].trim();
                if (next.isEmpty() || tableLike(next)) break;
                paragraph.add(next);
                index++;
            }
            if (!paragraph.isEmpty()) {
                out.add(
                        new ParsedBlock(
                                BlockType.TEXT,
                                page,
                                null,
                                String.join("\n", paragraph),
                                Map.of("format", "pdf")));
            }
        }
        return out;
    }

    private boolean tableLike(String line) {
        if (line == null || line.length() < 8) return false;
        String[] cells = line.trim().split("\\s{2,}|\\t+");
        if (cells.length < 2) return false;
        return java.util.Arrays.stream(cells).filter(value -> !value.isBlank()).count() >= 2;
    }

    private String normalizeTableRow(String line) {
        String[] cells = line.split("\\s{2,}|\\t+");
        List<String> cleaned = new ArrayList<>();
        for (String cell : cells) {
            String value = cell.trim();
            if (!value.isEmpty()) cleaned.add(value.replace("|", "\\|"));
        }
        return "| " + String.join(" | ", cleaned) + " |";
    }

    private List<ParsedAsset> embeddedAttachments(PDDocument pdf, List<String> warnings)
            throws IOException {
        List<ParsedAsset> assets = new ArrayList<>();
        try {
            var names = pdf.getDocumentCatalog().getNames();
            var embedded = names == null ? null : names.getEmbeddedFiles();
            var mapping = embedded == null ? null : embedded.getNames();
            if (mapping == null) return assets;
            for (Map.Entry<String, PDComplexFileSpecification> entry : mapping.entrySet()) {
                PDEmbeddedFile file = entry.getValue().getEmbeddedFile();
                if (file == null) continue;
                int size = file.getSize();
                if (size > maxAttachmentBytes) {
                    warnings.add("内嵌附件 " + entry.getKey() + " 超过解析大小限制，已跳过");
                    continue;
                }
                try (var input = file.createInputStream()) {
                    byte[] bytes = input.readAllBytes();
                    String filename =
                            entry.getValue().getFilename() == null
                                    ? entry.getKey()
                                    : entry.getValue().getFilename();
                    assets.add(
                            new ParsedAsset(
                                    AssetKind.ATTACHMENT,
                                    filename,
                                    file.getSubtype(),
                                    bytes,
                                    null,
                                    null,
                                    null,
                                    Map.of("source", "pdf-embedded-file")));
                }
            }
        } catch (RuntimeException error) {
            warnings.add("读取 PDF 内嵌附件失败：" + error.getMessage());
        }
        return assets;
    }

    private byte[] png(BufferedImage image) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }
}
