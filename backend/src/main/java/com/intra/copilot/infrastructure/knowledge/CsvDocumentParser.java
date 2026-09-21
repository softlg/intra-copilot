package com.intra.copilot.infrastructure.knowledge;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Component;

/** CSV/TSV parser with repeated headers for every 100-row chunk. */
@Component
public class CsvDocumentParser implements DocumentParser {
    private static final int ROWS_PER_BLOCK = 100;

    @Override
    public String id() {
        return "csv";
    }

    @Override
    public boolean supports(String filename) {
        if (filename == null) return false;
        String lower = filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".csv") || lower.endsWith(".tsv");
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
        String text = TextContentDecoder.decode(bytes);
        char delimiter = detectDelimiter(text);
        CSVFormat format = CSVFormat.DEFAULT.builder().setDelimiter(delimiter).get();
        List<CSVRecord> records;
        try (CSVParser parser = CSVParser.parse(new StringReader(text), format)) {
            records = parser.getRecords();
        }
        if (records.isEmpty()) return new ParsedDocument(List.of(), List.of(), Map.of(), List.of());
        CSVRecord headerRecord = records.get(0);
        List<String> header = new ArrayList<>();
        for (int column = 0; column < headerRecord.size(); column++) {
            header.add(clean(headerRecord.get(column)));
        }
        List<ParsedBlock> blocks = new ArrayList<>();
        int rowStart = 1;
        while (rowStart < records.size()) {
            int rowEnd = Math.min(records.size(), rowStart + ROWS_PER_BLOCK);
            List<String> lines = new ArrayList<>();
            lines.add(markdown(header));
            lines.add(markdown(header.stream().map(value -> "---").toList()));
            for (int row = rowStart; row < rowEnd; row++) {
                CSVRecord record = records.get(row);
                List<String> values = new ArrayList<>();
                for (int column = 0; column < header.size(); column++) {
                    values.add(column < record.size() ? clean(record.get(column)) : "");
                }
                lines.add(markdown(values));
            }
            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("format", delimiter == '\t' ? "tsv" : "csv");
            metadata.put("startRecord", rowStart + 1);
            metadata.put("endRecord", rowEnd);
            blocks.add(
                    new ParsedBlock(
                            BlockType.TABLE, null, null, String.join("\n", lines), metadata));
            rowStart = rowEnd;
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("format", delimiter == '\t' ? "tsv" : "csv");
        metadata.put("recordCount", records.size());
        return new ParsedDocument(blocks, List.of(), metadata, List.of());
    }

    private char detectDelimiter(String text) {
        String first = text.lines().findFirst().orElse("");
        char[] candidates = {',', '\t', ';', '|'};
        char selected = ',';
        int best = -1;
        for (char candidate : candidates) {
            int count = 0;
            for (int index = 0; index < first.length(); index++) {
                if (first.charAt(index) == candidate) count++;
            }
            if (count > best) {
                best = count;
                selected = candidate;
            }
        }
        return selected;
    }

    private String markdown(List<String> values) {
        return "| " + String.join(" | ", values) + " |";
    }

    private String clean(String value) {
        return value == null ? "" : value.replace("|", "\\|").replace("\n", " ").trim();
    }
}
