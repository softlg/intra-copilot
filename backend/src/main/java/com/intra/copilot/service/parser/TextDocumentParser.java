package com.intra.copilot.service.parser;

import com.intra.copilot.service.DocumentParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;

/** Markdown and plain text. Treated as a single page because there is no pagination. */
@Component
public class TextDocumentParser implements DocumentParser {

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
        return List.of(new PageText(null, null, new String(bytes, StandardCharsets.UTF_8)));
    }
}
