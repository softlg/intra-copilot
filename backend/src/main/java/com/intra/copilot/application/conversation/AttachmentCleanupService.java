package com.intra.copilot.application.conversation;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Removes staged attachments that were uploaded but never linked to a message. */
@Service
public class AttachmentCleanupService {
    private final AttachmentService attachments;

    public AttachmentCleanupService(AttachmentService attachments) {
        this.attachments = attachments;
    }

    @Scheduled(cron = "${app.attachment-cleanup-cron:0 15 * * * *}")
    public void cleanup() {
        attachments.deleteExpiredPending(200);
    }
}
