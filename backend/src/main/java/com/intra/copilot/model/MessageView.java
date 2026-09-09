package com.intra.copilot.model;

import java.time.Instant;
import java.util.List;

/**
 * 会话消息的视图模型，附带其附件列表。历史接口返回此类型，
 * 让前端在重新进入时也能拿到图片与文件。
 */
public record MessageView(
        String id,
        String conversationId,
        String role,
        String content,
        String agentId,
        String contextSummary,
        Instant createdAt,
        List<AttachmentView> attachments) {}
