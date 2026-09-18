package com.intra.copilot.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Optional OCR bridge for scanned PDFs and image documents.
 *
 * <p>Tesseract is intentionally invoked as an external process because the runtime image decides
 * which traineddata packs are available. Deployments without OCR keep the previous text-only
 * behaviour and receive a clear extraction warning instead of silently indexing an empty document.
 */
@Service
public class OcrService {
    private final boolean enabled;
    private final String command;
    private final String languages;
    private final int dpi;
    private final long timeoutSeconds;
    private final int maxCharacters;

    public OcrService(
            @Value("${ocr.enabled:false}") boolean enabled,
            @Value("${ocr.command:tesseract}") String command,
            @Value("${ocr.languages:chi_sim+eng}") String languages,
            @Value("${ocr.pdf-dpi:180}") int dpi,
            @Value("${ocr.timeout-seconds:90}") long timeoutSeconds,
            @Value("${ocr.max-characters:200000}") int maxCharacters) {
        this.enabled = enabled;
        this.command = command == null || command.isBlank() ? "tesseract" : command.trim();
        this.languages =
                languages == null || languages.isBlank() ? "chi_sim+eng" : languages.trim();
        this.dpi = Math.max(120, Math.min(400, dpi));
        this.timeoutSeconds = Math.max(5, timeoutSeconds);
        this.maxCharacters = Math.max(1000, maxCharacters);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public int dpi() {
        return dpi;
    }

    public boolean supportsImage(String filename) {
        if (filename == null) return false;
        String lower = filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".png")
                || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".bmp")
                || lower.endsWith(".webp")
                || lower.endsWith(".tif")
                || lower.endsWith(".tiff");
    }

    public String recognize(byte[] bytes, String mediaType, String filename) throws IOException {
        if (!enabled) return "";
        if (bytes == null || bytes.length == 0) return "";
        Path input = Files.createTempFile("intra-copilot-ocr-", extension(mediaType, filename));
        Path outputBase = Files.createTempFile("intra-copilot-ocr-output-", "");
        try {
            Files.write(input, bytes);
            Process process =
                    new ProcessBuilder(
                                    command,
                                    input.toAbsolutePath().toString(),
                                    outputBase.toAbsolutePath().toString(),
                                    "-l",
                                    languages)
                            .redirectErrorStream(true)
                            .start();
            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new IOException("OCR 识别超时");
            }
            String log =
                    new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (process.exitValue() != 0) {
                throw new IOException("OCR 执行失败：" + abbreviate(log, 500));
            }
            Path result = Path.of(outputBase.toAbsolutePath() + ".txt");
            if (!Files.exists(result)) return "";
            String text = Files.readString(result, StandardCharsets.UTF_8).trim();
            return text.length() <= maxCharacters ? text : text.substring(0, maxCharacters);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IOException("OCR 识别被中断", error);
        } finally {
            Files.deleteIfExists(input);
            Files.deleteIfExists(outputBase);
            Files.deleteIfExists(Path.of(outputBase.toAbsolutePath() + ".txt"));
        }
    }

    private String extension(String mediaType, String filename) {
        String lowerName = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        for (String candidate :
                new String[] {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"}) {
            if (lowerName.endsWith(candidate)) return candidate;
        }
        String lowerType = mediaType == null ? "" : mediaType.toLowerCase(Locale.ROOT);
        if (lowerType.contains("jpeg") || lowerType.contains("jpg")) return ".jpg";
        if (lowerType.contains("webp")) return ".webp";
        if (lowerType.contains("tiff")) return ".tiff";
        return ".png";
    }

    private String abbreviate(String value, int limit) {
        if (value == null || value.length() <= limit) return value == null ? "" : value;
        return value.substring(0, limit) + "…";
    }
}
