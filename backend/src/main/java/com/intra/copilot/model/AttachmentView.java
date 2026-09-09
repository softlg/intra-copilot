package com.intra.copilot.model;

/**
 * 聊天附件在前端展示所需的视图模型。{@code url} 指向后端提供的取回流式接口，
 * 这样 MinIO 凭证不会暴露给浏览器，也避免了跨域预签名 URL 的复杂度。
 */
public record AttachmentView(
        String id,
        String filename,
        String contentType,
        long size,
        boolean isImage,
        String url) {

    public static AttachmentView of(MessageAttachment attachment, String baseUrl) {
        return new AttachmentView(
                attachment.getId(),
                attachment.getFilename(),
                attachment.getContentType(),
                attachment.getByteSize(),
                attachment.getIsImage(),
                baseUrl + "/api/v1/attachments/" + attachment.getId());
    }
}
