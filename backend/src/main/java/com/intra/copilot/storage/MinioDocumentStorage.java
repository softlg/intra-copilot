package com.intra.copilot.storage;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * MinIO-backed {@link DocumentStorage}. Object keys follow the same {@code
 * {baseId}/{documentId}{ext}} layout as {@link LocalDocumentStorage} so the two implementations are
 * interchangeable behind the {@code DocumentStorage} interface.
 *
 * <p>Activated only when {@code minio.enabled=true}; otherwise {@link LocalDocumentStorage} is
 * used. The bucket is created on demand if it does not yet exist.
 */
@Component
@ConditionalOnProperty(name = "minio.enabled", havingValue = "true")
public class MinioDocumentStorage implements DocumentStorage {

    private final MinioClient client;
    private final String bucket;

    public MinioDocumentStorage(
            @Value("${minio.endpoint:}") String endpoint,
            @Value("${minio.access-key:}") String accessKey,
            @Value("${minio.secret-key:}") String secretKey,
            @Value("${minio.bucket:intra-copilot}") String bucket,
            @Value("${minio.region:}") String region) {
        if (endpoint == null
                || endpoint.isBlank()
                || accessKey == null
                || accessKey.isBlank()
                || secretKey == null
                || secretKey.isBlank()) {
            throw new IllegalStateException(
                    "minio.enabled=true 但缺少 minio.endpoint / access-key / secret-key 配置");
        }
        MinioClient.Builder builder =
                MinioClient.builder().endpoint(endpoint).credentials(accessKey, secretKey);
        if (region != null && !region.isBlank()) builder.region(region);
        this.client = builder.build();
        this.bucket = bucket;
    }

    @Override
    public String backend() {
        return "minio";
    }

    @Override
    public StoredObject store(String baseId, String documentId, String filename, byte[] bytes)
            throws IOException {
        ensureBucket();
        String key = keyOf(baseId, documentId, filename);
        try {
            client.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(key)
                            .contentType(guessContentType(filename))
                            .stream(new ByteArrayInputStream(bytes), bytes.length, -1)
                            .build());
        } catch (Exception e) {
            throw new IOException("写入 MinIO 对象失败：" + key, e);
        }
        return new StoredObject(key, sha256(bytes), bytes.length);
    }

    @Override
    public byte[] load(String storageKey) throws IOException {
        try {
            return client.getObject(
                            GetObjectArgs.builder().bucket(bucket).object(storageKey).build())
                    .readAllBytes();
        } catch (Exception e) {
            throw new IOException("读取 MinIO 对象失败：" + storageKey, e);
        }
    }

    @Override
    public void delete(String storageKey) throws IOException {
        try {
            client.removeObject(
                    RemoveObjectArgs.builder().bucket(bucket).object(storageKey).build());
        } catch (Exception e) {
            throw new IOException("删除 MinIO 对象失败：" + storageKey, e);
        }
    }

    private void ensureBucket() throws IOException {
        try {
            boolean exists = client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            }
        } catch (Exception e) {
            throw new IOException("无法确保 MinIO 桶存在：" + bucket, e);
        }
    }

    private String keyOf(String baseId, String documentId, String filename) {
        String safeBase = sanitize(baseId);
        String safeDoc = sanitize(documentId);
        String extension = extensionOf(filename);
        return safeBase + "/" + safeDoc + extension;
    }

    private String sanitize(String value) {
        if (value == null) return "_";
        return value.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private String extensionOf(String filename) {
        if (filename == null) return "";
        String lower = filename.toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        if (dot < 0 || dot == lower.length() - 1) return "";
        String extension = lower.substring(dot);
        return extension.matches("\\.[a-z0-9]{1,8}") ? extension : "";
    }

    private String guessContentType(String filename) {
        String lower = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".md")) return "text/markdown";
        return "application/octet-stream";
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
}
