package com.intra.copilot.infrastructure.knowledge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.intra.copilot.infrastructure.knowledge.DocumentParser;
import com.intra.copilot.infrastructure.knowledge.OcrService;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

class StructuredDocumentParserTest {

    @Test
    void markdownKeepsHeadingsTablesAndImageAltText() throws Exception {
        TextDocumentParser parser = new TextDocumentParser();
        String markdown =
                """
                # 用户手册

                第一段说明。

                | 字段 | 说明 |
                | --- | --- |
                | id | 主键 |

                ![流程图](diagram.png)
                """;

        DocumentParser.ParsedDocument parsed =
                parser.parseDocument(markdown.getBytes(StandardCharsets.UTF_8));

        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(block -> block.type() == DocumentParser.BlockType.HEADING));
        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(block -> block.type() == DocumentParser.BlockType.TABLE));
        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(
                                block ->
                                        block.type() == DocumentParser.BlockType.IMAGE
                                                && "流程图".equals(block.text())));
    }

    @Test
    void csvRepeatsHeadersAcrossRowBlocks() throws Exception {
        CsvDocumentParser parser = new CsvDocumentParser();
        StringBuilder csv = new StringBuilder("id,name\n");
        for (int index = 0; index < 150; index++) {
            csv.append(index).append(",名称").append(index).append('\n');
        }

        DocumentParser.ParsedDocument parsed =
                parser.parseDocument(csv.toString().getBytes(StandardCharsets.UTF_8));

        assertEquals(2, parsed.blocks().size());
        assertTrue(
                parsed.blocks().stream()
                        .allMatch(
                                block ->
                                        block.type() == DocumentParser.BlockType.TABLE
                                                && block.text().contains("| id | name |")));
    }

    @Test
    void xlsxProducesHeaderPreservingTableBlocks() throws Exception {
        byte[] bytes;
        try (XSSFWorkbook workbook = new XSSFWorkbook();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("订单");
            var header = sheet.createRow(0);
            header.createCell(0).setCellValue("订单号");
            header.createCell(1).setCellValue("金额");
            var row = sheet.createRow(1);
            row.createCell(0).setCellValue("A-1");
            row.createCell(1).setCellValue(12.5);
            workbook.write(out);
            bytes = out.toByteArray();
        }

        SpreadsheetDocumentParser parser =
                new SpreadsheetDocumentParser(mock(OcrService.class));
        DocumentParser.ParsedDocument parsed = parser.parseDocument(bytes);

        assertEquals(1, parsed.blocks().size());
        assertTrue(parsed.blocks().get(0).text().contains("| 订单号 | 金额 |"));
        assertTrue(parsed.blocks().get(0).text().contains("| A-1 | 12.5 |"));
    }

    @Test
    void docxKeepsTableStructure() throws Exception {
        byte[] bytes;
        try (XWPFDocument document = new XWPFDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            var heading = document.createParagraph();
            heading.setStyle("Heading1");
            heading.createRun().setText("接口说明");
            var table = document.createTable(2, 2);
            table.getRow(0).getCell(0).setText("字段");
            table.getRow(0).getCell(1).setText("类型");
            table.getRow(1).getCell(0).setText("id");
            table.getRow(1).getCell(1).setText("string");
            document.write(out);
            bytes = out.toByteArray();
        }

        DocxDocumentParser parser = new DocxDocumentParser(mock(OcrService.class));
        DocumentParser.ParsedDocument parsed = parser.parseDocument(bytes);

        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(block -> block.type() == DocumentParser.BlockType.HEADING));
        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(
                                block ->
                                        block.type() == DocumentParser.BlockType.TABLE
                                                && block.text().contains("| 字段 | 类型 |")));
    }

    @Test
    void htmlExtractsTextAndTable() throws Exception {
        HtmlDocumentParser parser = new HtmlDocumentParser();
        String html =
                "<h1>接口</h1><p>说明</p><table><tr><th>字段</th><th>类型</th></tr>"
                        + "<tr><td>id</td><td>string</td></tr></table>";

        DocumentParser.ParsedDocument parsed =
                parser.parseDocument(html.getBytes(StandardCharsets.UTF_8));

        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(block -> block.type() == DocumentParser.BlockType.HEADING));
        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(block -> block.type() == DocumentParser.BlockType.TABLE));
    }

    @Test
    void imageParserUsesOcrText() throws Exception {
        OcrService ocr = mock(OcrService.class);
        when(ocr.recognize(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn("识别出的图片文字");
        ImageDocumentParser parser = new ImageDocumentParser(ocr);

        DocumentParser.ParsedDocument parsed =
                parser.parseDocument(new byte[] {(byte) 0x89, 'P', 'N', 'G'});

        assertEquals(1, parsed.blocks().size());
        assertEquals("识别出的图片文字", parsed.blocks().get(0).text());
        assertEquals(1, parsed.assets().size());
    }

    @Test
    void scannedPdfUsesOcrFallbackAndStoresPageImage() throws Exception {
        OcrService ocr = mock(OcrService.class);
        when(ocr.isEnabled()).thenReturn(true);
        when(ocr.dpi()).thenReturn(120);
        when(ocr.recognize(
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any()))
                .thenReturn("扫描页中的文字");
        byte[] bytes;
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            document.addPage(new PDPage());
            document.save(out);
            bytes = out.toByteArray();
        }

        PdfDocumentParser parser = new PdfDocumentParser(ocr, 80, 1024 * 1024);
        DocumentParser.ParsedDocument parsed = parser.parseDocument(bytes);

        assertTrue(
                parsed.blocks().stream()
                        .anyMatch(block -> block.text().contains("扫描页中的文字")));
        assertEquals(1, parsed.assets().size());
        assertTrue(parsed.assets().get(0).bytes().length > 0);
    }
}
