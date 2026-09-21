package com.intra.copilot.infrastructure.knowledge;

import com.intra.copilot.infrastructure.knowledge.DocumentParser;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.springframework.stereotype.Component;

/** HTML parser that extracts headings, paragraphs, lists, code, tables and image references. */
@Component
public class HtmlDocumentParser implements DocumentParser {
    @Override
    public String id() {
        return "html";
    }

    @Override
    public boolean supports(String filename) {
        if (filename == null) return false;
        String lower = filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".html") || lower.endsWith(".htm");
    }

    @Override
    public List<PageText> parse(byte[] bytes) throws IOException {
        return parseDocument(bytes).blocks().stream()
                .map(block -> new PageText(block.pageNumber(), block.section(), block.text()))
                .toList();
    }

    @Override
    public ParsedDocument parseDocument(byte[] bytes) throws IOException {
        String html = TextContentDecoder.decode(bytes);
        org.jsoup.nodes.Document document = Jsoup.parse(html);
        document.select("script,style,noscript,svg").remove();
        List<ParsedBlock> blocks = new ArrayList<>();
        Deque<String> headings = new ArrayDeque<>();
        Element root = document.body() == null ? document : document.body();
        for (Node child : root.childNodes()) walk(child, headings, blocks);
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("format", "html");
        metadata.put("title", document.title());
        return new ParsedDocument(blocks, List.of(), metadata, List.of());
    }

    private void walk(Node node, Deque<String> headings, List<ParsedBlock> blocks) {
        if (!(node instanceof Element element)) {
            return;
        }
        String tag = element.tagName().toLowerCase(Locale.ROOT);
        if (tag.matches("h[1-6]")) {
            int level = Integer.parseInt(tag.substring(1));
            String text = element.text().trim();
            if (text.isEmpty()) return;
            while (headings.size() >= level) headings.removeLast();
            headings.addLast(text);
            blocks.add(
                    new ParsedBlock(
                            BlockType.HEADING,
                            null,
                            section(headings),
                            text,
                            Map.of("format", "html", "level", level)));
            return;
        }
        if ("table".equals(tag)) {
            String table = table(element);
            if (!table.isBlank()) {
                blocks.add(
                        new ParsedBlock(
                                BlockType.TABLE,
                                null,
                                section(headings),
                                table,
                                Map.of("format", "html")));
            }
            return;
        }
        if ("pre".equals(tag)) {
            String code = element.text().trim();
            if (!code.isEmpty()) {
                blocks.add(
                        new ParsedBlock(
                                BlockType.CODE,
                                null,
                                section(headings),
                                code,
                                Map.of("format", "html")));
            }
            return;
        }
        if ("img".equals(tag)) {
            String alt = element.attr("alt").trim();
            String src = element.attr("src").trim();
            blocks.add(
                    new ParsedBlock(
                            BlockType.IMAGE,
                            null,
                            section(headings),
                            alt.isEmpty() ? "[图片]" : alt,
                            Map.of("format", "html", "url", src)));
            return;
        }
        if (List.of("p", "li", "blockquote").contains(tag)) {
            String text = element.text().trim();
            if (!text.isEmpty()) {
                blocks.add(
                        new ParsedBlock(
                                BlockType.TEXT,
                                null,
                                section(headings),
                                text,
                                Map.of("format", "html", "tag", tag)));
            }
            return;
        }
        for (Node child : element.childNodes()) walk(child, headings, blocks);
    }

    private String table(Element table) {
        List<String> rows = new ArrayList<>();
        for (Element row : table.select("tr")) {
            List<String> cells = new ArrayList<>();
            for (Element cell : row.children()) {
                String cellTag = cell.tagName().toLowerCase(Locale.ROOT);
                if (!"th".equals(cellTag) && !"td".equals(cellTag)) continue;
                cells.add(cell.text().replace("|", "\\|").replace("\n", " ").trim());
            }
            if (!cells.isEmpty()) rows.add("| " + String.join(" | ", cells) + " |");
        }
        return String.join("\n", rows);
    }

    private String section(Deque<String> headings) {
        return headings.isEmpty() ? null : String.join(" / ", headings);
    }
}
