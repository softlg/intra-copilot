package com.intra.copilot.infrastructure.knowledge;

import com.intra.copilot.infrastructure.knowledge.DocumentParser;
import com.intra.copilot.infrastructure.knowledge.OcrService;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFPictureData;
import org.apache.poi.xslf.usermodel.XSLFPictureShape;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTable;
import org.apache.poi.xslf.usermodel.XSLFTableCell;
import org.apache.poi.xslf.usermodel.XSLFTableRow;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.springframework.stereotype.Component;

/** PPTX parser that keeps slide boundaries and table cells. */
@Component
public class PptxDocumentParser implements DocumentParser {
    private final OcrService ocr;

    public PptxDocumentParser(OcrService ocr) {
        this.ocr = ocr;
    }

    @Override
    public String id() {
        return "pptx";
    }

    @Override
    public boolean supports(String filename) {
        return filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".pptx");
    }

    @Override
    public List<PageText> parse(byte[] bytes) throws IOException {
        return parseDocument(bytes).blocks().stream()
                .map(block -> new PageText(block.pageNumber(), block.section(), block.text()))
                .toList();
    }

    @Override
    public ParsedDocument parseDocument(byte[] bytes) throws IOException {
        try (XMLSlideShow slideShow =
                new XMLSlideShow(new ByteArrayInputStream(bytes))) {
            List<ParsedBlock> blocks = new ArrayList<>();
            List<ParsedAsset> assets = new ArrayList<>();
            List<String> warnings = new ArrayList<>();
            int imageIndex = 0;
            for (int index = 0; index < slideShow.getSlides().size(); index++) {
                XSLFSlide slide = slideShow.getSlides().get(index);
                int pageNumber = index + 1;
                String title = slideTitle(slide);
                for (XSLFShape shape : slide.getShapes()) {
                    if (shape instanceof XSLFTable table) {
                        String markdown = table(table);
                        if (!markdown.isBlank()) {
                            blocks.add(
                                    new ParsedBlock(
                                            BlockType.TABLE,
                                            pageNumber,
                                            title,
                                            markdown,
                                            Map.of("format", "pptx")));
                        }
                    } else if (shape instanceof XSLFTextShape textShape) {
                        String text = textShape.getText().trim();
                        if (!text.isEmpty()) {
                            blocks.add(
                                    new ParsedBlock(
                                            BlockType.TEXT,
                                            pageNumber,
                                            title,
                                            text,
                                            Map.of("format", "pptx")));
                        }
                    } else if (shape instanceof XSLFPictureShape pictureShape) {
                        imageIndex++;
                        XSLFPictureData picture = pictureShape.getPictureData();
                        String name =
                                "slide-"
                                        + pageNumber
                                        + "-image-"
                                        + imageIndex
                                        + "."
                                        + picture.suggestFileExtension();
                        String recognized = "";
                        if (ocr.isEnabled()) {
                            try {
                                recognized = ocr.recognize(picture.getData(), picture.getContentType(), name);
                            } catch (IOException error) {
                                warnings.add("幻灯片 " + pageNumber + " 图片 OCR 失败：" + error.getMessage());
                            }
                        }
                        assets.add(
                                new ParsedAsset(
                                        AssetKind.IMAGE,
                                        name,
                                        picture.getContentType(),
                                        picture.getData(),
                                        pageNumber,
                                        title,
                                        recognized,
                                        Map.of("format", "pptx")));
                        if (!recognized.isBlank()) {
                            blocks.add(
                                    new ParsedBlock(
                                            BlockType.IMAGE,
                                            pageNumber,
                                            title,
                                            recognized,
                                            Map.of("format", "pptx", "source", "ocr", "name", name)));
                        }
                    }
                }
                if (slide.getNotes() != null) {
                    String notes = notes(slide);
                    if (!notes.isEmpty()) {
                        blocks.add(
                                new ParsedBlock(
                                        BlockType.TEXT,
                                        pageNumber,
                                        title,
                                        notes,
                                        Map.of("format", "pptx", "source", "speaker-notes")));
                    }
                }
            }
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("format", "pptx");
            metadata.put("slideCount", slideShow.getSlides().size());
            metadata.put("imageCount", imageIndex);
            return new ParsedDocument(blocks, assets, metadata, warnings);
        }
    }

    private String slideTitle(XSLFSlide slide) {
        try {
            if (slide.getTitle() != null) return slide.getTitle().trim();
        } catch (RuntimeException ignored) {
        }
        for (XSLFShape shape : slide.getShapes()) {
            if (shape instanceof XSLFTextShape text && !text.getText().isBlank()) {
                return text.getText().trim();
            }
        }
        return "幻灯片";
    }

    private String notes(XSLFSlide slide) {
        StringBuilder text = new StringBuilder();
        for (var paragraphs : slide.getNotes().getTextParagraphs()) {
            for (var paragraph : paragraphs) {
                String value = paragraph.getText().trim();
                if (value.isEmpty()) continue;
                if (text.length() > 0) text.append('\n');
                text.append(value);
            }
        }
        return text.toString().trim();
    }

    private String table(XSLFTable table) {
        List<String> rows = new ArrayList<>();
        for (XSLFTableRow row : table.getRows()) {
            List<String> cells = new ArrayList<>();
            for (XSLFTableCell cell : row.getCells()) {
                cells.add(cell.getText().replace("|", "\\|").replace("\n", " ").trim());
            }
            rows.add("| " + String.join(" | ", cells) + " |");
            if (rows.size() == 1) {
                rows.add("| " + String.join(" | ", cells.stream().map(value -> "---").toList()) + " |");
            }
        }
        return String.join("\n", rows);
    }
}
