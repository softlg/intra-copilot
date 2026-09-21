package com.intra.copilot.infrastructure.knowledge;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Markdown and plain text. Treated as a single page because there is no pagination. */
@Component
public class TextDocumentParser implements DocumentParser {
    private static final Pattern HEADING = Pattern.compile("^(#{1,6})\\s+(.*)$");
    private static final Pattern IMAGE =
            Pattern.compile("^!\\[([^]]*)]\\(([^)]+)\\)(?:\\s*\\{([^}]+)})?\\s*$");

    @Override
    public String id() {
        return "text";
    }

    @Override
    public boolean supports(String filename) {
        if (filename == null) return false;
        String lower = filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt");
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
        List<ParsedBlock> blocks =
                looksLikeMarkdown(text)
                        ? markdownBlocks(text)
                        : List.of(
                                new ParsedBlock(
                                        BlockType.TEXT,
                                        null,
                                        null,
                                        text.trim(),
                                        Map.of("format", "text")));
        return new ParsedDocument(
                blocks, List.of(), Map.of("charset", "utf-8-or-gb18030"), List.of());
    }

    private boolean looksLikeMarkdown(String text) {
        return text.startsWith("# ")
                || text.contains("\n# ")
                || text.contains("```")
                || text.contains("![")
                || text.contains("\n|")
                || text.contains("\n---");
    }

    private List<ParsedBlock> markdownBlocks(String text) {
        List<ParsedBlock> out = new ArrayList<>();
        Deque<String> headings = new ArrayDeque<>();
        String[] lines = text.replace("\r\n", "\n").split("\n", -1);
        int index = 0;
        while (index < lines.length) {
            String raw = lines[index];
            String line = raw.trim();
            if (line.isEmpty()) {
                index++;
                continue;
            }
            Matcher heading = HEADING.matcher(line);
            if (heading.matches()) {
                int level = heading.group(1).length();
                String title = heading.group(2).trim();
                while (headings.size() >= level) headings.removeLast();
                headings.addLast(title);
                out.add(
                        new ParsedBlock(
                                BlockType.HEADING,
                                null,
                                section(headings),
                                title,
                                Map.of("level", level, "format", "markdown")));
                index++;
                continue;
            }
            if (line.startsWith("```") || line.startsWith("~~~")) {
                String fence = line.substring(0, 3);
                int start = index++;
                StringBuilder code = new StringBuilder();
                while (index < lines.length && !lines[index].trim().startsWith(fence)) {
                    if (code.length() > 0) code.append('\n');
                    code.append(lines[index]);
                    index++;
                }
                if (index < lines.length) index++;
                out.add(
                        new ParsedBlock(
                                BlockType.CODE,
                                null,
                                section(headings),
                                code.toString().trim(),
                                Map.of("format", "markdown", "startLine", start + 1)));
                continue;
            }
            Matcher image = IMAGE.matcher(line);
            if (image.matches()) {
                String alt = image.group(1).trim();
                String url = image.group(2).trim();
                Map<String, Object> metadata = new LinkedHashMap<>();
                metadata.put("format", "markdown");
                metadata.put("url", url);
                if (image.group(3) != null) metadata.put("attributes", image.group(3).trim());
                out.add(
                        new ParsedBlock(
                                BlockType.IMAGE,
                                null,
                                section(headings),
                                alt.isBlank() ? "[图片]" : alt,
                                metadata));
                index++;
                continue;
            }
            if (isTableRow(line)) {
                int start = index;
                List<String> rows = new ArrayList<>();
                while (index < lines.length && isTableRow(lines[index].trim())) {
                    rows.add(lines[index].trim());
                    index++;
                }
                out.add(
                        new ParsedBlock(
                                BlockType.TABLE,
                                null,
                                section(headings),
                                String.join("\n", rows),
                                Map.of("format", "markdown", "startLine", start + 1)));
                continue;
            }

            List<String> paragraph = new ArrayList<>();
            while (index < lines.length) {
                String next = lines[index].trim();
                if (next.isEmpty()
                        || HEADING.matcher(next).matches()
                        || next.startsWith("```")
                        || next.startsWith("~~~")
                        || IMAGE.matcher(next).matches()
                        || isTableRow(next)) break;
                paragraph.add(next);
                index++;
            }
            if (!paragraph.isEmpty()) {
                out.add(
                        new ParsedBlock(
                                BlockType.TEXT,
                                null,
                                section(headings),
                                String.join("\n", paragraph),
                                Map.of("format", "markdown")));
            }
        }
        return out;
    }

    private boolean isTableRow(String line) {
        return line != null && line.indexOf('|') >= 0 && line.split("\\|", -1).length >= 3;
    }

    private String section(Deque<String> headings) {
        return headings.isEmpty() ? null : String.join(" / ", headings);
    }
}
