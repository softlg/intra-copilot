package com.intra.copilot.service.parser;

import com.intra.copilot.service.DocumentParser;
import com.intra.copilot.service.OcrService;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.openxml4j.opc.PackagePart;
import org.apache.poi.openxml4j.exceptions.InvalidFormatException;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Component;

/** DOCX parser that preserves headings, tables, images and embedded package objects. */
@Component
public class DocxDocumentParser implements DocumentParser {
    private final OcrService ocr;

    public DocxDocumentParser(OcrService ocr) {
        this.ocr = ocr;
    }

    @Override
    public String id() {
        return "docx";
    }

    @Override
    public boolean supports(String filename) {
        return filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".docx");
    }

    @Override
    public List<PageText> parse(byte[] bytes) throws IOException {
        return parseDocument(bytes).blocks().stream()
                .map(block -> new PageText(block.pageNumber(), block.section(), block.text()))
                .toList();
    }

    @Override
    public ParsedDocument parseDocument(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            List<ParsedBlock> blocks = new ArrayList<>();
            Deque<String> headings = new ArrayDeque<>();
            for (IBodyElement element : document.getBodyElements()) {
                if (element instanceof XWPFParagraph paragraph) {
                    String text = paragraph.getText().trim();
                    if (text.isEmpty()) continue;
                    if (isHeading(paragraph)) {
                        int level = headingLevel(paragraph);
                        while (headings.size() >= level) headings.removeLast();
                        headings.addLast(text);
                        blocks.add(
                                new ParsedBlock(
                                        BlockType.HEADING,
                                        null,
                                        section(headings),
                                        text,
                                        Map.of("format", "docx", "level", level)));
                    } else {
                        blocks.add(
                                new ParsedBlock(
                                        BlockType.TEXT,
                                        null,
                                        section(headings),
                                        text,
                                        Map.of("format", "docx")));
                    }
                } else if (element instanceof XWPFTable table) {
                    String markdown = table(table);
                    if (!markdown.isBlank()) {
                        blocks.add(
                                new ParsedBlock(
                                        BlockType.TABLE,
                                        null,
                                        section(headings),
                                        markdown,
                                        Map.of("format", "docx", "rows", table.getRows().size())));
                    }
                }
            }

            List<ParsedAsset> assets = new ArrayList<>();
            List<String> warnings = new ArrayList<>();
            int imageIndex = 0;
            for (var picture : document.getAllPictures()) {
                imageIndex++;
                byte[] data = picture.getData();
                String name = "image-" + imageIndex + "." + picture.suggestFileExtension();
                String recognized = "";
                if (ocr.isEnabled()) {
                    try {
                        recognized =
                                ocr.recognize(data, picture.getPackagePart().getContentType(), name);
                    } catch (IOException error) {
                        warnings.add("图片 " + name + " OCR 失败：" + error.getMessage());
                    }
                }
                assets.add(
                        new ParsedAsset(
                                AssetKind.IMAGE,
                                name,
                                picture.getPackagePart().getContentType(),
                                data,
                                null,
                                null,
                                recognized,
                                Map.of("format", "docx")));
                if (!recognized.isBlank()) {
                    blocks.add(
                            new ParsedBlock(
                                    BlockType.IMAGE,
                                    null,
                                    null,
                                    recognized,
                                    Map.of("format", "docx", "source", "ocr", "name", name)));
                }
            }
            try {
                for (PackagePart part : document.getPackage().getParts()) {
                    String name = part.getPartName().getName();
                    if (!name.contains("/embeddings/")) continue;
                    try (var input = part.getInputStream()) {
                        byte[] data = input.readAllBytes();
                        assets.add(
                                new ParsedAsset(
                                        AssetKind.ATTACHMENT,
                                        basename(name),
                                        part.getContentType(),
                                        data,
                                        null,
                                        null,
                                        null,
                                        Map.of("format", "docx", "source", "embedded-object")));
                    }
                }
            } catch (InvalidFormatException error) {
                warnings.add("读取 DOCX 内嵌对象失败：" + error.getMessage());
            }
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("format", "docx");
            metadata.put("paragraphCount", blocks.size());
            metadata.put("imageCount", imageIndex);
            return new ParsedDocument(blocks, assets, metadata, warnings);
        }
    }

    private boolean isHeading(XWPFParagraph paragraph) {
        String style = paragraph.getStyle();
        String text = paragraph.getText() == null ? "" : paragraph.getText();
        return (style != null
                        && (style.toLowerCase(Locale.ROOT).contains("heading")
                                || style.contains("标题")))
                || text.matches("^\\d+(?:\\.\\d+)*\\s+.+");
    }

    private int headingLevel(XWPFParagraph paragraph) {
        String style = paragraph.getStyle();
        if (style != null) {
            var matcher = java.util.regex.Pattern.compile("(\\d+)").matcher(style);
            if (matcher.find()) return Math.max(1, Math.min(6, Integer.parseInt(matcher.group(1))));
        }
        String text = paragraph.getText() == null ? "" : paragraph.getText().trim();
        int dots = 0;
        for (int i = 0; i < text.length() && text.charAt(i) != ' '; i++) {
            if (text.charAt(i) == '.') dots++;
        }
        return Math.max(1, Math.min(6, dots + 1));
    }

    private String table(XWPFTable table) {
        List<String> rows = new ArrayList<>();
        for (XWPFTableRow row : table.getRows()) {
            List<String> cells = new ArrayList<>();
            for (XWPFTableCell cell : row.getTableCells()) {
                cells.add(cell.getText().replace("|", "\\|").replace("\n", " ").trim());
            }
            rows.add("| " + String.join(" | ", cells) + " |");
            if (rows.size() == 1) {
                rows.add("| " + String.join(" | ", cells.stream().map(value -> "---").toList()) + " |");
            }
        }
        return String.join("\n", rows);
    }

    private String section(Deque<String> headings) {
        return headings.isEmpty() ? null : String.join(" / ", headings);
    }

    private String basename(String value) {
        int slash = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
        return slash < 0 ? value : value.substring(slash + 1);
    }
}
