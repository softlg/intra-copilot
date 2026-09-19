package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.intra.copilot.model.MessageAttachment;
import com.intra.copilot.repo.MessageAttachmentRepository;
import com.intra.copilot.storage.DocumentStorage;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class AttachmentServiceTest {

    @Test
    void rejectsCrossOwnerAttachmentRead() throws Exception {
        DocumentStorage storage = mock(DocumentStorage.class);
        MessageAttachmentRepository attachments = mock(MessageAttachmentRepository.class);
        when(attachments.findOwned("AT-1", "extension", "user-b")).thenReturn(Optional.empty());
        AttachmentService service =
                new AttachmentService(storage, attachments, "127.0.0.1", 8080, 1024);

        assertThrows(
                IllegalArgumentException.class, () -> service.serve("extension", "user-b", "AT-1"));
        verify(storage, never()).load(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void linksOnlyOwnedPendingAttachments() {
        MessageAttachmentRepository attachments = mock(MessageAttachmentRepository.class);
        MessageAttachment pending = new MessageAttachment();
        pending.setId("AT-1");
        pending.setOwnerSource("extension");
        pending.setOwnerUserId("user-a");
        pending.setStatus("PENDING");
        when(attachments.findOwned("AT-1", "extension", "user-a")).thenReturn(Optional.of(pending));
        when(attachments.attachOwnedPending("AT-1", "MS-1", "extension", "user-a"))
                .thenReturn(true);
        AttachmentService service =
                new AttachmentService(
                        mock(DocumentStorage.class), attachments, "127.0.0.1", 8080, 1024);

        service.linkToMessage("extension", "user-a", List.of("AT-1"), "MS-1");

        verify(attachments).attachOwnedPending("AT-1", "MS-1", "extension", "user-a");
    }

    @Test
    void refusesToLinkAnAttachmentOwnedByAnotherUser() {
        MessageAttachmentRepository attachments = mock(MessageAttachmentRepository.class);
        when(attachments.attachOwnedPending("AT-1", "MS-1", "extension", "user-b"))
                .thenReturn(false);
        AttachmentService service =
                new AttachmentService(
                        mock(DocumentStorage.class), attachments, "127.0.0.1", 8080, 1024);

        assertThrows(
                IllegalArgumentException.class,
                () -> service.linkToMessage("extension", "user-b", List.of("AT-1"), "MS-1"));
    }
}
