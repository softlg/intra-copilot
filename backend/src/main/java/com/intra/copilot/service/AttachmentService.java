package com.intra.copilot.service;

import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.model.MessageAttachment;
import com.intra.copilot.repo.MessageAttachmentRepository;
import com.intra.copilot.storage.DocumentStorage;
import com.intra.copilot.util.EntityIdGenerator;
import java.io.IOException;
import java.io.BufferedInputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 聊天附件的存储与取回。字节通过 {@link DocumentStorage} 落地（MinIO 或本地磁盘），
 * 数据库只保存指针与元数据；取回时再拼出后端流式接口地址，避免把对象存储凭证泄漏给前端。
 */
@Service
public class AttachmentService {

    private final DocumentStorage storage;
    private final MessageAttachmentRepository attachments;
    private final String baseUrl;
    private final long maxBytes;

    public AttachmentService(
            DocumentStorage storage,
            MessageAttachmentRepository attachments,
            @Value("${server.address:127.0.0.1}") String serverAddress,
            @Value("${server.port:8080}") int serverPort,
            @Value("${app.max-attachment-bytes:26214400}") long maxBytes) {
        this.storage = storage;
        this.attachments = attachments;
        this.baseUrl = "http://" + serverAddress + ":" + serverPort;
        this.maxBytes = Math.max(1, maxBytes);
    }

    /** 上传一批附件，落库为「暂存」状态（message_id 为空），返回可展示的视图列表。 */
    public List<AttachmentView> upload(
            String ownerSource, String ownerUserId, List<MultipartFile> files) throws IOException {
        if (files == null || files.isEmpty()) throw new IllegalArgumentException("上传文件不能为空");
        validateOwner(ownerSource, ownerUserId);
        List<AttachmentView> views = new ArrayList<>();
        int order = 0;
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) continue;
            if (file.getSize() > maxBytes) {
                throw new IllegalArgumentException("文件 " + originalName(file) + " 超过单条附件大小限制");
            }
            String name = originalName(file);
            MessageAttachment attachment = new MessageAttachment();
            attachment.setId(EntityIdGenerator.next("AT"));
            attachment.setFilename(name);
            attachment.setSortOrder(order++);
            attachment.setOwnerSource(ownerSource);
            attachment.setOwnerUserId(ownerUserId);
            try (BufferedInputStream input = new BufferedInputStream(file.getInputStream())) {
                input.mark(64);
                byte[] header = input.readNBytes(64);
                input.reset();
                String contentType = safeContentType(name, file.getContentType(), header);
                DocumentStorage.StoredObject stored =
                        storage.store(
                                "chat", attachment.getId(), name, input, file.getSize());
                attachment.setStorageBackend(storage.backend());
                attachment.setStorageKey(stored.key());
                finishUpload(attachment, contentType, stored);
            }
            /*
             * The stream must remain open while storage.store consumes it. The block above is
             * intentionally structured so no byte array is materialized for large uploads.
             */
            views.add(AttachmentView.of(attachment, baseUrl));
        }
        if (views.isEmpty()) throw new IllegalArgumentException("上传文件不能为空");
        return views;
    }

    private void finishUpload(
            MessageAttachment attachment,
            String contentType,
            DocumentStorage.StoredObject stored) {
        attachment.setContentType(contentType);
        attachment.setByteSize(stored.byteSize());
        attachment.setIsImage(contentType.startsWith("image/"));
        attachment.setStatus("PENDING");
        attachment.setExpiresAt(Instant.now().plus(Duration.ofHours(24)));
        attachment.setCreatedAt(Instant.now());
        try {
            attachments.save(attachment);
        } catch (RuntimeException error) {
            try {
                storage.delete(stored.key());
            } catch (IOException ignored) {
            }
            throw error;
        }
    }

    /** 把暂存附件绑定到某条用户消息，使其随该消息一起出现在历史里。 */
    public void linkToMessage(
            String ownerSource, String ownerUserId, List<String> attachmentIds, String messageId) {
        if (attachmentIds == null || attachmentIds.isEmpty()) return;
        validateOwner(ownerSource, ownerUserId);
        for (String id : attachmentIds) {
            MessageAttachment attachment =
                    attachments
                            .findOwned(id, ownerSource, ownerUserId)
                            .orElseThrow(
                                    () ->
                                            new IllegalArgumentException(
                                                    "附件不存在、已绑定或不属于当前用户：" + id));
            if (!"PENDING".equals(attachment.getStatus())
                    && !messageId.equals(attachment.getMessageId())) {
                throw new IllegalArgumentException("附件已绑定到其他消息：" + id);
            }
        }
        for (String id : attachmentIds) {
            if (!attachments.attachOwnedPending(id, messageId, ownerSource, ownerUserId)) {
                throw new IllegalArgumentException("附件不存在、已绑定或不属于当前用户：" + id);
            }
        }
    }

    /** 读取单条附件的字节，供流式返回；同时给出原始文件名与内容类型。 */
    public StoredBytes serve(String ownerSource, String ownerUserId, String id) throws IOException {
        validateOwner(ownerSource, ownerUserId);
        MessageAttachment attachment =
                attachments
                        .findOwned(id, ownerSource, ownerUserId)
                        .orElseThrow(() -> new IllegalArgumentException("附件不存在"));
        byte[] bytes = storage.load(attachment.getStorageKey());
        return new StoredBytes(
                bytes,
                attachment.getContentType(),
                attachment.getFilename(),
                isSafeInline(attachment.getContentType()));
    }

    /** Administrative read path. The caller must already be authorized for conversation logs. */
    public StoredBytes serveForAdmin(String id) throws IOException {
        MessageAttachment attachment =
                attachments.findById(id).orElseThrow(() -> new IllegalArgumentException("附件不存在"));
        byte[] bytes = storage.load(attachment.getStorageKey());
        return new StoredBytes(
                bytes,
                attachment.getContentType(),
                attachment.getFilename(),
                isSafeInline(attachment.getContentType()));
    }

    /** 列出某条消息的全部附件（按排序顺序），用于历史接口组装视图。 */
    public List<AttachmentView> listForMessage(String messageId) {
        return attachments
                .findByMessageIdOrderBySortOrderAsc(messageId)
                .stream()
                .map(attachment -> AttachmentView.of(attachment, baseUrl))
                .toList();
    }

    public Map<String, List<AttachmentView>> listForMessages(List<String> messageIds) {
        if (messageIds == null || messageIds.isEmpty()) return Map.of();
        return attachments
                .findByMessageIds(messageIds)
                .stream()
                .collect(
                        Collectors.groupingBy(
                                MessageAttachment::getMessageId,
                                LinkedHashMap::new,
                                Collectors.mapping(
                                        attachment -> AttachmentView.of(attachment, baseUrl),
                                        Collectors.toList())));
    }

    /** 把图片类附件还原成 data URL，供大模型「看见」图片内容。非图片附件被忽略。 */
    public List<String> imageDataUrls(
            String ownerSource, String ownerUserId, List<String> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) return List.of();
        validateOwner(ownerSource, ownerUserId);
        List<String> urls = new ArrayList<>();
        for (String id : attachmentIds) {
            attachments
                    .findOwned(id, ownerSource, ownerUserId)
                    .ifPresent(
                            attachment -> {
                                if (!attachment.getIsImage()) return;
                                try {
                                    byte[] bytes = storage.load(attachment.getStorageKey());
                                    String contentType =
                                            attachment.getContentType() == null
                                                    ? "application/octet-stream"
                                                    : attachment.getContentType();
                                    urls.add(
                                            "data:"
                                                    + contentType
                                                    + ";base64,"
                                                    + java.util.Base64.getEncoder()
                                                            .encodeToString(bytes));
                                } catch (IOException e) {
                                    // 单张图片读取失败不应中断整个对话
                                }
                            });
        }
        return urls;
    }

    public void deleteExpiredPending(int limit) {
        for (MessageAttachment attachment : attachments.findExpiredPending(Instant.now(), limit)) {
            try {
                storage.delete(attachment.getStorageKey());
            } catch (IOException ignored) {
                // A missing object must not block metadata cleanup.
            }
            attachments.deleteById(attachment.getId());
        }
    }

    public record StoredBytes(
            byte[] bytes, String contentType, String filename, boolean safeInline) {
        public StoredBytes(byte[] bytes, String contentType, String filename) {
            this(bytes, contentType, filename, isSafeInline(contentType));
        }
    }

    private static String safeContentType(String filename, String declared, byte[] bytes) {
        String detected = detectImageType(bytes);
        if (detected != null) return detected;
        if (startsWith(bytes, "%PDF-")) return "application/pdf";
        String lower = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".txt")
                && declared != null
                && declared.toLowerCase(Locale.ROOT).startsWith("text/plain")
                && !containsNull(bytes)) {
            return "text/plain";
        }
        return "application/octet-stream";
    }

    private static String detectImageType(byte[] bytes) {
        if (bytes.length >= 8
                && (bytes[0] & 0xff) == 0x89
                && bytes[1] == 'P'
                && bytes[2] == 'N'
                && bytes[3] == 'G') return "image/png";
        if (bytes.length >= 3
                && (bytes[0] & 0xff) == 0xff
                && (bytes[1] & 0xff) == 0xd8
                && (bytes[2] & 0xff) == 0xff) return "image/jpeg";
        if (startsWith(bytes, "GIF87a") || startsWith(bytes, "GIF89a")) {
            return "image/gif";
        }
        if (bytes.length >= 12
                && startsWith(bytes, "RIFF")
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P') return "image/webp";
        if (startsWith(bytes, "BM")) return "image/bmp";
        if ((bytes.length >= 4
                        && bytes[0] == 'I'
                        && bytes[1] == 'I'
                        && bytes[2] == 42
                        && bytes[3] == 0)
                || (bytes.length >= 4
                        && bytes[0] == 'M'
                        && bytes[1] == 'M'
                        && bytes[2] == 0
                        && bytes[3] == 42)) return "image/tiff";
        return null;
    }

    private static boolean isSafeInline(String contentType) {
        return contentType != null
                && List.of(
                                "image/png",
                                "image/jpeg",
                                "image/gif",
                                "image/webp",
                                "image/bmp",
                                "image/tiff",
                                "text/plain")
                        .contains(contentType.toLowerCase(Locale.ROOT));
    }

    private static boolean startsWith(byte[] bytes, String value) {
        byte[] prefix = value.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        if (bytes.length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (bytes[index] != prefix[index]) return false;
        }
        return true;
    }

    private static boolean containsNull(byte[] bytes) {
        for (byte value : bytes) {
            if (value == 0) return true;
        }
        return false;
    }

    private static String originalName(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null || name.isBlank()) return "file";
        return java.nio.file.Paths.get(name).getFileName().toString();
    }

    private static void validateOwner(String ownerSource, String ownerUserId) {
        if (ownerSource == null
                || ownerSource.isBlank()
                || ownerUserId == null
                || ownerUserId.isBlank()) {
            throw new IllegalArgumentException("附件所有者不能为空");
        }
    }
}
