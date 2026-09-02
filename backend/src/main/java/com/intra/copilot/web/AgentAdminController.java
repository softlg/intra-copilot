package com.intra.copilot.web;

import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.service.AgentRegistry;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/agents")
public class AgentAdminController {
  private final AgentRegistry registry;

  public AgentAdminController(AgentRegistry registry) {
    this.registry = registry;
  }


  @GetMapping
  public List<AgentDefinition> list() {
    return registry.allDefinitions();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public AgentDefinition create(@RequestBody AgentDefinition definition) {
    validate(definition);
    if (registry.allDefinitions().stream().anyMatch(item -> item.getId().equals(definition.getId()))) {
      throw new IllegalArgumentException("Agent ID 已存在");
    }
    return registry.save(definition);
  }

  @PutMapping("/{id}")
  public AgentDefinition update(@PathVariable String id, @RequestBody AgentDefinition definition) {
    definition.setId(id);
    validate(definition);
    return registry.save(definition);
  }

  public record EnabledRequest(boolean enabled) {}

  @PatchMapping("/{id}/enabled")
  public AgentDefinition enabled(@PathVariable String id, @RequestBody EnabledRequest request) {
    AgentDefinition definition = registry.allDefinitions().stream()
        .filter(item -> item.getId().equals(id))
        .findFirst()
        .orElseThrow(() -> new java.util.NoSuchElementException("Agent 不存在"));
    definition.setEnabled(request.enabled());
    return registry.save(definition);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable String id) {
    registry.delete(id);
  }

  private void validate(AgentDefinition definition) {
    if (definition == null
        || definition.getId() == null
        || !definition.getId().matches("[a-z0-9][a-z0-9-]{1,127}")) {
      throw new IllegalArgumentException("Agent ID 只能使用 2-128 位小写字母、数字和连字符");
    }
    if (definition.getDisplayName() == null || definition.getDisplayName().isBlank()) {
      throw new IllegalArgumentException("Agent 名称不能为空");
    }
    if (definition.getSystemPrompt() == null || definition.getSystemPrompt().isBlank()) {
      throw new IllegalArgumentException("Agent 系统提示词不能为空");
    }
  }
}
