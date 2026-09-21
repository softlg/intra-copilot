package com.intra.copilot.architecture;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class ArchitectureBoundaryTest {
    private static final Path SOURCE_ROOT = Path.of("src/main/java/com/intra/copilot");
    private static final Pattern IMPORT_PATTERN =
            Pattern.compile("(?m)^import\\s+(?:static\\s+)?(com\\.intra\\.copilot\\.[\\w.]+)\\s*;");

    @Test
    void domainDoesNotDependOnOuterLayers() throws IOException {
        assertEquals(
                List.of(),
                forbiddenImports(
                        SOURCE_ROOT.resolve("domain"),
                        List.of(
                                "com.intra.copilot.application.",
                                "com.intra.copilot.infrastructure.",
                                "com.intra.copilot.interfaces.")));
    }

    @Test
    void sharedDoesNotDependOnApplicationOrInterfaces() throws IOException {
        assertEquals(
                List.of(),
                forbiddenImports(
                        SOURCE_ROOT.resolve("shared"),
                        List.of(
                                "com.intra.copilot.application.",
                                "com.intra.copilot.interfaces.")));
    }

    @Test
    void legacyTechnicalPackagesAreRemovedFromMainSources() throws IOException {
        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(SOURCE_ROOT)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file);
                if (source.matches(
                        "(?s).*package\\s+com\\.intra\\.copilot\\.(agent|model|repo|service|storage|web)(\\.|;).*")) {
                    violations.add(file.toString());
                }
            }
        }
        assertEquals(List.of(), violations);
    }

    private List<String> forbiddenImports(Path root, List<String> forbiddenPrefixes)
            throws IOException {
        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file);
                var matcher = IMPORT_PATTERN.matcher(source);
                while (matcher.find()) {
                    String imported = matcher.group(1);
                    if (forbiddenPrefixes.stream().anyMatch(imported::startsWith)) {
                        violations.add(file + " -> " + imported);
                    }
                }
            }
        }
        return violations;
    }
}
