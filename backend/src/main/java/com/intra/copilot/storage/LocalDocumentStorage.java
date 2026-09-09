package com.intra.copilot.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Stores documents under {@code ${app.upload-dir}/kb/{baseId}/{documentId}{ext}}. */
@Component
public class LocalDocumentStorage implements DocumentStorage {

    private final Path root;

    public LocalDocumentStorage(@Value("${app.upload-dir:${user.home}/.intra-copilot/uploads}") String uploadDir) {
        this.root = Path.of(uploadDir).toAbsolutePath().normalize().resolve("kb");
    }

    @Override
    public String backend() {
        return "local";
    }

    @Override
    public StoredObject store(String baseId, String documentId, String filename, byte[] bytes) throws IOException {
        String extension = extensionOf(filename);
        Path target = resolve(baseId, documentId + extension);
        Files.createDirectories(target.getParent());
        Files.write(target, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
        return new StoredObject(relative(target), sha256(bytes), bytes.length);
    }

    @Override
    public byte[] load(String storageKey) throws IOException {
        return Files.readAllBytes(resolve(storageKey));
    }

    @Override
    public void delete(String storageKey) throws IOException {
        Files.deleteIfExists(resolve(storageKey));
    }

    /** Resolves a storage key inside the upload root, rejecting any traversal attempt. */
    private Path resolve(String... segments) {
        Path candidate = root;
        for (String segment : segments) {
            if (segment == null) continue;
            for (String part : segment.replace('\\', '/').split("/")) {
                if (part.isEmpty() || ".".equals(part)) continue;
                if ("..".equals(part)) throw new IllegalArgumentException("非法的存储路径片段：" + segment);
                candidate = candidate.resolve(part.replaceAll("[^A-Za-z0-9._-]", "_"));
            }
        }
        Path normalized = candidate.normalize();
        if (!normalized.startsWith(root)) {
            throw new IllegalArgumentException("存储路径超出根目录范围：" + normalized);
        }
        return normalized;
    }

    private String relative(Path path) {
        return root.relativize(path).toString().replace('\\', '/');
    }

    private String extensionOf(String filename) {
        if (filename == null) return "";
        String lower = filename.toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        if (dot < 0 || dot == lower.length() - 1) return "";
        String extension = lower.substring(dot);
        return extension.matches("\\.[a-z0-9]{1,8}") ? extension : "";
    }

    private String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder out = new StringBuilder();
            for (byte value : digest) out.append(String.format("%02x", value));
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("无法计算文件指纹", e);
        }
    }

    /** Exposed for tests and for operators that need to move the upload directory. */
    public Path root() {
        return root;
    }
}
