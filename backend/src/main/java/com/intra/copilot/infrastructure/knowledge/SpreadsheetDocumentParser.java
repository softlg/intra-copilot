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
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFPictureData;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/** XLS/XLSX parser that turns each sheet into header-preserving Markdown tables. */
@Component
public class SpreadsheetDocumentParser implements DocumentParser {
    private static final int ROWS_PER_BLOCK = 100;

    private final OcrService ocr;

    public SpreadsheetDocumentParser(OcrService ocr) {
        this.ocr = ocr;
    }

    @Override
    public String id() {
        return "spreadsheet";
    }

    @Override
    public boolean supports(String filename) {
        if (filename == null) return false;
        String lower = filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".xlsx") || lower.endsWith(".xls");
    }

    @Override
    public List<PageText> parse(byte[] bytes) throws IOException {
        return parseDocument(bytes).blocks().stream()
                .map(block -> new PageText(block.pageNumber(), block.section(), block.text()))
                .toList();
    }

    @Override
    public ParsedDocument parseDocument(byte[] bytes) throws IOException {
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            DataFormatter formatter = new DataFormatter(Locale.ROOT);
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            List<ParsedBlock> blocks = new ArrayList<>();
            for (int sheetIndex = 0; sheetIndex < workbook.getNumberOfSheets(); sheetIndex++) {
                Sheet sheet = workbook.getSheetAt(sheetIndex);
                blocks.addAll(sheetBlocks(sheet, sheetIndex + 1, formatter, evaluator));
            }
            List<ParsedAsset> assets =
                    workbook instanceof XSSFWorkbook xssf ? images(xssf) : List.of();
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("format", workbook instanceof XSSFWorkbook ? "xlsx" : "xls");
            metadata.put("sheetCount", workbook.getNumberOfSheets());
            metadata.put("imageCount", assets.size());
            return new ParsedDocument(blocks, assets, metadata, List.of());
        }
    }

    private List<ParsedBlock> sheetBlocks(
            Sheet sheet, int pageNumber, DataFormatter formatter, FormulaEvaluator evaluator) {
        List<ParsedBlock> out = new ArrayList<>();
        int first = firstNonEmptyRow(sheet);
        if (first < 0) return out;
        Row header = sheet.getRow(first);
        int columns = Math.max(1, header.getLastCellNum());
        List<String> headerCells = cells(header, columns, formatter, evaluator);
        int rowStart = first + 1;
        while (rowStart <= sheet.getLastRowNum()) {
            int rowEnd = Math.min(sheet.getLastRowNum(), rowStart + ROWS_PER_BLOCK - 1);
            List<String> lines = new ArrayList<>();
            lines.add(markdownRow(headerCells));
            lines.add(markdownRow(headerCells.stream().map(value -> "---").toList()));
            int written = 0;
            for (int rowIndex = rowStart; rowIndex <= rowEnd; rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null || isEmpty(row, columns, formatter, evaluator)) continue;
                lines.add(markdownRow(cells(row, columns, formatter, evaluator)));
                written++;
            }
            if (written > 0 || rowStart == first + 1) {
                Map<String, Object> metadata = new LinkedHashMap<>();
                metadata.put("format", "spreadsheet");
                metadata.put("sheetName", sheet.getSheetName());
                metadata.put("startRow", rowStart + 1);
                metadata.put("endRow", rowEnd + 1);
                out.add(
                        new ParsedBlock(
                                BlockType.TABLE,
                                pageNumber,
                                sheet.getSheetName(),
                                String.join("\n", lines),
                                metadata));
            }
            rowStart = rowEnd + 1;
        }
        return out;
    }

    private int firstNonEmptyRow(Sheet sheet) {
        for (int rowIndex = sheet.getFirstRowNum(); rowIndex <= sheet.getLastRowNum(); rowIndex++) {
            Row row = sheet.getRow(rowIndex);
            if (row != null && row.getPhysicalNumberOfCells() > 0) return rowIndex;
        }
        return -1;
    }

    private List<String> cells(
            Row row, int columns, DataFormatter formatter, FormulaEvaluator evaluator) {
        List<String> values = new ArrayList<>(columns);
        for (int column = 0; column < columns; column++) {
            Cell cell = row == null ? null : row.getCell(column, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
            String value = cell == null ? "" : formatter.formatCellValue(cell, evaluator);
            values.add(value.replace("|", "\\|").replace("\n", " ").trim());
        }
        return values;
    }

    private boolean isEmpty(
            Row row, int columns, DataFormatter formatter, FormulaEvaluator evaluator) {
        return cells(row, columns, formatter, evaluator).stream().allMatch(String::isBlank);
    }

    private String markdownRow(List<String> cells) {
        return "| " + String.join(" | ", cells) + " |";
    }

    private List<ParsedAsset> images(XSSFWorkbook workbook) {
        List<ParsedAsset> assets = new ArrayList<>();
        int index = 0;
        for (XSSFPictureData picture : workbook.getAllPictures()) {
            index++;
            String extension = picture.suggestFileExtension();
            String name = "spreadsheet-image-" + index + "." + extension;
            String extracted = "";
            if (ocr.isEnabled()) {
                try {
                    extracted = ocr.recognize(picture.getData(), picture.getMimeType(), name);
                } catch (IOException ignored) {
                    extracted = "";
                }
            }
            assets.add(
                    new ParsedAsset(
                            AssetKind.IMAGE,
                            name,
                            picture.getMimeType(),
                            picture.getData(),
                            null,
                            null,
                            extracted,
                            Map.of("format", "xlsx")));
        }
        return assets;
    }
}
