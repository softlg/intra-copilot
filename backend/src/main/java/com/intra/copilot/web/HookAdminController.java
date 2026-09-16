package com.intra.copilot.web;

import com.intra.copilot.model.HookDefinition;
import com.intra.copilot.model.HookDefinitionVersion;
import com.intra.copilot.service.HookService;
import com.intra.copilot.service.auth.RequestContext;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/hooks")
public class HookAdminController {
  private final HookService hooks;

  public HookAdminController(HookService hooks) {
    this.hooks = hooks;
  }

  @GetMapping
  public List<HookDefinition> list(
      @RequestParam(required = false) String query,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String scope,
      @RequestParam(required = false) String ruleType) {
    return hooks.list(query, status, scope, ruleType);
  }

  @GetMapping("/{id}")
  public HookDefinition get(@PathVariable String id) {
    return hooks.get(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public HookDefinition create(@RequestBody HookDefinition hook) {
    hook.setEnabled(false);
    return hooks.create(hook, actor());
  }

  @PutMapping("/{id}")
  public HookDefinition update(
      @PathVariable String id,
      @RequestParam(defaultValue = "0") long version,
      @RequestParam(required = false) String changeNote,
      @RequestBody HookDefinition hook) {
    return hooks.update(id, hook, version, actor(), changeNote);
  }

  @PatchMapping("/{id}/enabled")
  public HookDefinition setEnabled(
      @PathVariable String id, @RequestBody HookEnabledRequest request) {
    return hooks.setEnabled(id, request.enabled(), request.version(), actor());
  }

  @PostMapping("/validate")
  public HookService.HookValidationResult validate(@RequestBody HookDefinition hook) {
    return hooks.validateDefinition(hook);
  }

  @PostMapping("/test")
  public HookService.HookTestResult test(@RequestBody HookTestRequest request) {
    return hooks.test(request.definition(), request.toContext());
  }

  @GetMapping("/{id}/versions")
  public List<HookDefinitionVersion> versions(@PathVariable String id) {
    hooks.get(id);
    return hooks.versions(id);
  }

  @GetMapping("/{id}/stats")
  public HookService.HookStats stats(@PathVariable String id) {
    return hooks.stats(id);
  }

  @PostMapping("/{id}/rollback")
  public HookDefinition rollback(@PathVariable String id, @RequestBody RollbackRequest request) {
    return hooks.rollback(id, request.version(), actor());
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @PathVariable String id, @RequestParam(defaultValue = "0") long version) {
    hooks.delete(id, version, actor());
  }

  private static String actor() {
    return RequestContext.currentOrAnonymous().actorLabel();
  }

  public record HookEnabledRequest(boolean enabled, long version) {}

  public record RollbackRequest(long version) {}

  public record HookTestRequest(
      HookDefinition definition,
      String message,
      String pageContext,
      Boolean pageContextConsent,
      String agentId,
      String agentRole,
      String phase,
      Map<String, Boolean> permissions,
      Integer attachmentCount) {
    HookService.Context toContext() {
      boolean consent = Boolean.TRUE.equals(pageContextConsent);
      return new HookService.Context(
          message,
          consent ? pageContext : "",
          agentId,
          agentRole,
          phase == null || phase.isBlank() ? HookService.PHASE_PRE_AGENT : phase,
          consent,
          permissions == null ? Map.of() : permissions,
          attachmentCount == null ? 0 : attachmentCount);
    }
  }
}
