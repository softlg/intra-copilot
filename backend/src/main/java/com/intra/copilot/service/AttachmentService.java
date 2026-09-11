package com.intra.copilot.service;

import com.intra.copilot.model.AttachmentView;
import com.intra.copilot.model.MessageAttachment;
import com.intra.copilot.repo.MessageAttachmentRepository;
import com.intra.copilot.storage.DocumentStorage;
import com.intra.copilot.util.EntityIdGenerator;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
    public List<AttachmentView> upload(List<MultipartFile> files) throws IOException {
        if (files == null || files.isEmpty()) throw new IllegalArgumentException("上传文件不能为空");
        List<AttachmentView> views = new ArrayList<>();
        int order = 0;
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) continue;
            if (file.getSize() > maxBytes) {
                throw new IllegalArgumentException("文件 " + originalName(file) + " 超过单条附件大小限制");
            }
            byte[] bytes = file.getBytes();
            String name = originalName(file);
            String contentType = file.getContentType();
            MessageAttachment attachment = new MessageAttachment();
            attachment.setId(EntityIdGenerator.next("AT"));
            attachment.setFilename(name);
            attachment.setContentType(contentType);
            attachment.setByteSize(bytes.length);
            attachment.setIsImage(isImage(contentType, name));
            attachment.setSortOrder(order++);
            attachment.setCreatedAt(Instant.now());
            DocumentStorage.StoredObject stored =
                    storage.store("chat", attachment.getId(), name, bytes);
            attachment.setStorageBackend(storage.backend());
            attachment.setStorageKey(stored.key());
            attachments.save(attachment);
            views.add(AttachmentView.of(attachment, baseUrl));
        }
        if (views.isEmpty()) throw new IllegalArgumentException("上传文件不能为空");
        return views;
    }

    /** 把暂存附件绑定到某条用户消息，使其随该消息一起出现在历史里。 */
    public void linkToMessage(List<String> attachmentIds, String messageId) {
        if (attachmentIds == null || attachmentIds.isEmpty()) return;
        for (String id : attachmentIds) {
            attachments
                    .findById(id)
                    .ifPresent(
                            attachment -> {
                                attachment.setMessageId(messageId);
                                attachments.save(attachment);
                            });
        }
    }

    /** 读取单条附件的字节，供流式返回；同时给出原始文件名与内容类型。 */
    public StoredBytes serve(String id) throws IOException {
        MessageAttachment attachment =
                attachments.findById(id).orElseThrow(() -> new IllegalArgumentException("附件不存在"));
        byte[] bytes = storage.load(attachment.getStorageKey());
        return new StoredBytes(bytes, attachment.getContentType(), attachment.getFilename());
    }

    /** 列出某条消息的全部附件（按排序顺序），用于历史接口组装视图。 */
    public List<AttachmentView> listForMessage(String messageId) {
        return attachments
                .findByMessageIdOrderBySortOrderAsc(messageId)
                .stream()
                .map(attachment -> AttachmentView.of(attachment, baseUrl))
                .toList();
    }

    /** 把图片类附件还原成 data URL，供大模型「看见」图片内容。非图片附件被忽略。 */
    public List<String> imageDataUrls(List<String> attachmentIds) {
        if (attachmentIds == null || attachmentIds.isEmpty()) return List.of();
        List<String> urls = new ArrayList<>();
        for (String id : attachmentIds) {
            attachments
                    .findById(id)
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

    public record StoredBytes(byte[] bytes, String contentType, String filename) {}

    private static boolean isImage(String contentType, String filename) {
        if (contentType != null && contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            return true;
        }
        String lower = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".png")
                || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg")
                || lower.endsWith(".gif")
                || lower.endsWith(".webp")
                || lower.endsWith(".bmp");
    }

    private static String originalName(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null || name.isBlank()) return "file";
        return java.nio.file.Paths.get(name).getFileName().toString();
    }
}
