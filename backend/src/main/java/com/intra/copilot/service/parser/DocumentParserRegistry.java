package com.intra.copilot.service.parser;

import com.intra.copilot.service.DocumentParser;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Routes a filename to the parser that can read it. */
@Component
public class DocumentParserRegistry {

    private final List<DocumentParser> parsers;

    public DocumentParserRegistry(List<DocumentParser> parsers) {
        this.parsers = parsers == null ? List.of() : new ArrayList<>(parsers);
    }

    public boolean supports(String filename) {
        return parsers.stream().anyMatch(parser -> parser.supports(filename));
    }

    public DocumentParser forFilename(String filename) {
        return parsers.stream()
                .filter(parser -> parser.supports(filename))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("暂不支持的文件类型：" + filename));
    }

    public List<String> supportedIds() {
        List<String> out = new ArrayList<>();
        for (DocumentParser parser : parsers) out.add(parser.id());
        return out;
    }

    public Map<String, String> descriptor() {
        Map<String, String> out = new LinkedHashMap<>();
        for (DocumentParser parser : parsers) out.put(parser.id(), parser.getClass().getSimpleName());
        return out;
    }
}
