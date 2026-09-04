package com.intra.copilot.web;

import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.LlmClient;
import java.time.Duration;
import java.util.Map;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/agents")
public class AgentAdminController {
  private final AgentRegistry registry;
  private final LlmClient llm;

  public AgentAdminController(AgentRegistry registry, LlmClient llm) {
    this.registry = registry;
    this.llm = llm;
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
    definition.setSystemAgent(false);
    return registry.save(definition);
  }

  @PutMapping("/{id}")
  public AgentDefinition update(@PathVariable String id, @RequestBody AgentDefinition definition) {
    definition.setId(id);
    AgentDefinition existing = registry.allDefinitions().stream()
        .filter(item -> item.getId().equals(id))
        .findFirst()
        .orElseThrow(() -> new java.util.NoSuchElementException("Agent 不存在"));
    definition.setSystemAgent(existing.isSystemAgent());
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

  public record AgentTestRequest(String message, String pageContext) {}

  /** Runs a one-off message through the selected Agent without creating a chat session. */
  @PostMapping("/{id}/test")
  public Map<String, Object> test(@PathVariable String id, @RequestBody AgentTestRequest request) {
    String message = request == null || request.message() == null ? "" : request.message().trim();
    if (message.isBlank()) throw new IllegalArgumentException("测试消息不能为空");
    Agent agent = registry.findEnabled(id).orElseThrow(() -> new IllegalArgumentException("Agent 不存在或已停用"));
    String input = message;
    if (request.pageContext() != null && !request.pageContext().isBlank()) {
      input += "\n\n浏览器上下文（仅供分析）：\n" + request.pageContext().trim();
    }
    String response = llm.complete(agent.systemPrompt(), List.of(), input)
        .blockOptional(Duration.ofSeconds(30))
        .orElse("未配置 LLM_API_KEY，无法调用模型。请配置后重试。");
    Map<String, Object> result = new java.util.LinkedHashMap<>();
    result.put("agentId", agent.id());
    result.put("displayName", agent.displayName());
    result.put("supportsBrowserActions", agent.supportsBrowserActions());
    if (agent instanceof ConfigurableAgent configurable) {
      result.put("toolIds", configurable.definition().getToolIds());
      result.put("skillIds", configurable.definition().getSkillIds());
    }
    result.put("response", response);
    return result;
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
