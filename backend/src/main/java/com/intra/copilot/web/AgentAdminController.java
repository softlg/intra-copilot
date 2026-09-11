package com.intra.copilot.web;

import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.agent.Agent;
import com.intra.copilot.agent.ConfigurableAgent;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.AgentConfigurationService;
import com.intra.copilot.service.LlmClient;
import com.intra.copilot.util.EntityIdGenerator;
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
        private final AgentConfigurationService configurations;

        public AgentAdminController(AgentRegistry registry, LlmClient llm, AgentConfigurationService configurations) {
                this.registry = registry;
                this.llm = llm;
                this.configurations = configurations;
        }


        @GetMapping
        public List<AgentDefinition> list() {
                return registry.allDefinitions();
        }

        @PostMapping
        @ResponseStatus(HttpStatus.CREATED)
        public AgentDefinition create(@RequestBody AgentDefinition definition) {
                if (definition == null) throw new IllegalArgumentException("Agent 配置不能为空");
                definition.setId(EntityIdGenerator.next("AG"));
                if (definition.getRole() == null || definition.getRole().isBlank()) definition.setRole("DOMAIN");
                validate(definition);
                definition.setSystemAgent(false);
                return configurations.saveDraft(definition);
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
                return configurations.saveDraft(definition);
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

        public record PublishRequest(String releaseNote) {}
        public record RollbackRequest(long version) {}

        @GetMapping("/{id}/versions")
        public List<com.intra.copilot.model.AgentConfigVersion> versions(@PathVariable String id) {
                return configurations.versions(id);
        }

        @PostMapping("/{id}/publish")
        public com.intra.copilot.model.AgentConfigVersion publish(
                        @PathVariable String id, @RequestBody(required = false) PublishRequest request) {
                return configurations.publish(id, request == null ? null : request.releaseNote());
        }

        @PostMapping("/{id}/rollback")
        public AgentDefinition rollback(@PathVariable String id, @RequestBody RollbackRequest request) {
                return configurations.rollback(id, request.version());
        }

        @GetMapping("/{id}/children")
        public List<com.intra.copilot.model.AgentChildBinding> children(@PathVariable String id) {
                return configurations.children(id);
        }

        @PutMapping("/{id}/children")
        public List<com.intra.copilot.model.AgentChildBinding> children(
                        @PathVariable String id,
                        @RequestBody List<com.intra.copilot.model.AgentChildBinding> bindings) {
                return configurations.replaceChildren(id, bindings);
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
                String response;
                try {
                        response = llm.complete(agent.systemPrompt(), List.of(), input)
                                        .blockOptional(Duration.ofSeconds(30))
                                        .orElse("未配置 LLM_API_KEY，无法调用模型。请配置后重试。");
                } catch (Exception error) {
                        // 模型/网关异常显式反馈给调试台，而不是伪装成一次正常回答。
                        response = "模型调用失败：" + describe(error);
                }
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

        private String describe(Throwable error) {
                String message = error.getMessage();
                return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
        }

        private void validate(AgentDefinition definition) {
                if (definition == null
                                || definition.getId() == null
                                || !definition.getId().matches("[A-Za-z0-9][A-Za-z0-9-]{1,127}")) {
                        throw new IllegalArgumentException("Agent ID 只能使用 2-128 位字母、数字和连字符");
                }
                if (definition.getDisplayName() == null || definition.getDisplayName().isBlank()) {
                        throw new IllegalArgumentException("Agent 名称不能为空");
                }
                if (definition.getSystemPrompt() == null || definition.getSystemPrompt().isBlank()) {
                        throw new IllegalArgumentException("Agent 系统提示词不能为空");
                }
        }
}
