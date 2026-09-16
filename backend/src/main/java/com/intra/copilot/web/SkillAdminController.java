package com.intra.copilot.web;

import com.intra.copilot.model.SkillAuditLog;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.SkillDefinitionVersion;
import com.intra.copilot.service.SkillManagementService;
import com.intra.copilot.service.auth.RequestContext;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Release-oriented administration API for prompt Skills. */
@RestController
@RequestMapping("/api/v1/admin/skills")
public class SkillAdminController {
    private final SkillManagementService skills;

    public SkillAdminController(SkillManagementService skills) {
        this.skills = skills;
    }

    @GetMapping
    public List<SkillDefinition> list() {
        return skills.list();
    }

    @GetMapping("/{id}")
    public SkillDefinition get(@PathVariable String id) {
        return skills.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SkillDefinition create(@RequestBody SkillDefinition request) {
        return skills.create(request, actor());
    }

    @PutMapping("/{id}")
    public SkillDefinition update(@PathVariable String id, @RequestBody SkillDefinition request) {
        return skills.update(id, request, actor());
    }

    @PatchMapping("/{id}/enabled")
    public SkillDefinition enabled(@PathVariable String id, @RequestBody EnabledRequest request) {
        return skills.setEnabled(id, request.enabled(), request.expectedVersion(), actor());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        skills.delete(id, actor());
    }

    @PostMapping("/{id}/publish")
    public SkillDefinition publish(
            @PathVariable String id, @RequestBody(required = false) PublishRequest request) {
        PublishRequest value = request == null ? new PublishRequest(null, 0) : request;
        return skills.publish(id, value.releaseNote(), value.expectedVersion(), actor());
    }

    @PostMapping("/{id}/rollback")
    public SkillDefinition rollback(@PathVariable String id, @RequestBody RollbackRequest request) {
        return skills.rollback(id, request.version(), request.expectedVersion(), actor());
    }

    @GetMapping("/{id}/versions")
    public List<SkillDefinitionVersion> versions(@PathVariable String id) {
        return skills.versions(id);
    }

    @GetMapping("/{id}/audit")
    public List<SkillAuditLog> audit(@PathVariable String id) {
        return skills.audit(id);
    }

    @PostMapping("/{id}/test")
    public SkillManagementService.SkillTestResult test(
            @PathVariable String id, @RequestBody TestRequest request) {
        return skills.test(
                id,
                request == null ? "" : request.message(),
                request == null ? null : request.baseSystemPrompt());
    }

    private String actor() {
        return RequestContext.currentOrAnonymous().actorLabel();
    }

    public record EnabledRequest(boolean enabled, long expectedVersion) {}

    public record PublishRequest(String releaseNote, long expectedVersion) {}

    public record RollbackRequest(long version, long expectedVersion) {}

    public record TestRequest(String message, String baseSystemPrompt) {}
}
