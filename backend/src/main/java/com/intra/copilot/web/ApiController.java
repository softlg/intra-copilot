package com.intra.copilot.web;

import com.intra.copilot.agent.*;
import com.intra.copilot.model.*;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.AttachmentService;
import com.intra.copilot.service.ChatService;
import com.intra.copilot.service.auth.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1")
public class ApiController {
    private final ChatService chat;
    private final GeneralAgent general;
    private final RouteCopilotAgent routeCopilot;
    private final AgentRegistry registry;
    private final AttachmentService attachmentService;

    public ApiController(
            ChatService c,
            GeneralAgent g,
            RouteCopilotAgent routeCopilot,
            AgentRegistry registry,
            AttachmentService attachmentService) {
        chat = c;
        general = g;
        this.routeCopilot = routeCopilot;
        this.registry = registry;
        this.attachmentService = attachmentService;
    }

    @GetMapping("/agents")
    public List<Map<String, Object>> agents() {
        return registry.enabledDefinitions()
                .stream()
                .filter(definition -> List.of("GENERAL", "DOMAIN").contains(definition.getRole()))
                .map(
                        definition -> {
                            Map<String, Object> value = new LinkedHashMap<>();
                            value.put("id", definition.getId());
                            value.put("displayName", definition.getDisplayName());
                            value.put("description", definition.getDescription());
                            value.put("role", definition.getRole());
                            value.put(
                                    "supportsBrowserActions",
                                    definition.isSupportsBrowserActions());
                            value.put("publishedVersion", definition.getPublishedVersion());
                            return value;
                        })
                .toList();
    }

    @PostMapping("/sessions")
    public Conversation create() {
        var identity = RequestContext.current();
        return chat.create(identity.source(), identity.userId());
    }

    @GetMapping("/sessions")
    public List<Conversation> list() {
        var identity = RequestContext.current();
        return chat.list(identity.source(), identity.userId());
    }

    @GetMapping("/sessions/{id}/messages")
    public List<MessageView> history(@PathVariable String id) {
        var identity = RequestContext.current();
        return chat.historyWithAttachments(identity.source(), identity.userId(), id);
    }

    public record RenameSessionRequest(String title) {}

    @PatchMapping("/sessions/{id}")
    public Conversation rename(@PathVariable String id, @RequestBody RenameSessionRequest req) {
        var identity = RequestContext.current();
        return chat.rename(
                identity.source(), identity.userId(), id, req == null ? null : req.title());
    }

    public record ReorderSessionsRequest(List<String> orderedIds) {}

    @PostMapping("/sessions/reorder")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorder(@RequestBody ReorderSessionsRequest req) {
        var identity = RequestContext.current();
        chat.reorder(identity.source(), identity.userId(), req == null ? null : req.orderedIds());
    }

    @DeleteMapping("/sessions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        var identity = RequestContext.current();
        chat.delete(identity.source(), identity.userId(), id);
    }

    public record ChatRequest(
            String sessionId,
            String message,
            String agentId,
            String pageContext,
            Map<String, Boolean> permissions,
            List<String> attachmentIds) {}

    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestBody ChatRequest req, HttpServletRequest request) {
        var identity = RequestContext.current();
        return chat.chat(
                identity.source(),
                identity.userId(),
                req.sessionId(),
                req.message(),
                req.agentId(),
                req.pageContext(),
                req.permissions(),
                req.attachmentIds(),
                request.getRemoteAddr());
    }

    public record ActionResult(String status, String result) {}

    @PostMapping("/actions/{id}/result")
    public ActionProposal action(@PathVariable String id, @RequestBody ActionResult req) {
        return chat.result(id, req.status(), req.result());
    }

    /**
     * 上传聊天附件（图片或文件）。字节经 {@link AttachmentService} 落到对象存储（MinIO 或本地）， 返回可展示的附件视图列表（含后端取回地址）。随后通过
     * {@code /chat/stream} 的 {@code attachmentIds} 关联到具体消息。
     */
    @PostMapping(value = "/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<AttachmentView> uploadAttachments(@RequestParam("files") List<MultipartFile> files)
            throws Exception {
        var identity = RequestContext.current();
        return attachmentService.upload(files);
    }

    /** 取回单条附件字节，供前端渲染图片或下载文件。需鉴权。 */
    @GetMapping("/attachments/{id}")
    public ResponseEntity<ByteArrayResource> serveAttachment(@PathVariable String id)
            throws Exception {
        var identity = RequestContext.current();
        var stored = attachmentService.serve(id);
        byte[] bytes = stored.bytes();
        ByteArrayResource resource = new ByteArrayResource(bytes);
        String contentType =
                stored.contentType() == null ? "application/octet-stream" : stored.contentType();
        String disposition = "inline; filename=\"" + stored.filename().replace("\"", "") + "\"";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .contentLength(bytes.length)
                .body(resource);
    }
}
