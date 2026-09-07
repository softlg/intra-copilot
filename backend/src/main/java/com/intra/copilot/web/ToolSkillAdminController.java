package com.intra.copilot.web;

import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.model.HookDefinition;
import com.intra.copilot.repo.HookDefinitionRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.net.URI;
import java.net.InetAddress;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class ToolSkillAdminController {
        private final ToolDefinitionRepository tools; private final SkillDefinitionRepository skills;
        private final HookDefinitionRepository hooks;
        private final boolean allowHttp;
        private final boolean allowPrivateNetwork;
        public ToolSkillAdminController(
                        ToolDefinitionRepository tools,
                        SkillDefinitionRepository skills,
                        HookDefinitionRepository hooks,
                        @Value("${tools.allow-http:true}") boolean allowHttp,
                        @Value("${tools.allow-private-network:true}") boolean allowPrivateNetwork) {
                this.tools = tools;
                this.skills = skills;
                this.hooks = hooks;
                this.allowHttp = allowHttp;
                this.allowPrivateNetwork = allowPrivateNetwork;
        }
        @GetMapping("/tools") public List<ToolDefinition> tools() { return tools.findAll(); }
        @PostMapping("/tools") @ResponseStatus(HttpStatus.CREATED) public ToolDefinition createTool(@RequestBody ToolDefinition t) { validateTool(t); ensureToolNameAvailable(t.getName(), null); t.setName(t.getName().trim()); return tools.save(t); }
        @PutMapping("/tools/{id}") public ToolDefinition updateTool(@PathVariable String id, @RequestBody ToolDefinition t) { t.setId(id); validateTool(t); ensureToolNameAvailable(t.getName(), id); t.setName(t.getName().trim()); t.touch(); return tools.save(t); }
        @DeleteMapping("/tools/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteTool(@PathVariable String id) { tools.deleteById(id); }
        @GetMapping("/skills") public List<SkillDefinition> skills() { return skills.findAll(); }
        @PostMapping("/skills") @ResponseStatus(HttpStatus.CREATED) public SkillDefinition createSkill(@RequestBody SkillDefinition s) { validateSkill(s); ensureSkillNameAvailable(s.getName(), null); s.setName(s.getName().trim()); return skills.save(s); }
        @PutMapping("/skills/{id}") public SkillDefinition updateSkill(@PathVariable String id, @RequestBody SkillDefinition s) { s.setId(id); validateSkill(s); ensureSkillNameAvailable(s.getName(), id); s.setName(s.getName().trim()); s.touch(); return skills.save(s); }
        @DeleteMapping("/skills/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteSkill(@PathVariable String id) { skills.deleteById(id); }
        @GetMapping("/hooks") public List<HookDefinition> hooks() { return hooks.findAll(); }
        @PostMapping("/hooks") @ResponseStatus(HttpStatus.CREATED)
        public HookDefinition createHook(@RequestBody HookDefinition hook) {
                validateHook(hook);
                ensureHookNameAvailable(hook.getName(), null);
                hook.setName(hook.getName().trim());
                return hooks.save(hook);
        }
        @PutMapping("/hooks/{id}")
        public HookDefinition updateHook(@PathVariable String id, @RequestBody HookDefinition hook) {
                hook.setId(id);
                validateHook(hook);
                ensureHookNameAvailable(hook.getName(), id);
                hook.setName(hook.getName().trim());
                hook.touch();
                return hooks.save(hook);
        }
        @DeleteMapping("/hooks/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
        public void deleteHook(@PathVariable String id) { hooks.deleteById(id); }
        private void validateTool(ToolDefinition t) {
                if (t.getName() == null || t.getName().isBlank()) throw new IllegalArgumentException("工具名称不能为空");
                if ("HTTP".equalsIgnoreCase(t.getType())) {
                        validateEndpoint(t.getEndpoint(), "HTTP 工具必须配置 endpoint");
                }
                if ("MCP".equalsIgnoreCase(t.getType())) {
                        if (t.getMcpServerUrl() == null || t.getMcpServerUrl().isBlank()) throw new IllegalArgumentException("MCP 工具必须配置服务器地址");
                        validateEndpoint(t.getMcpServerUrl(), "MCP 工具必须配置有效服务器地址");
                        if (t.getMcpTransport() == null || !("SSE".equalsIgnoreCase(t.getMcpTransport()) || "STREAMABLE_HTTP".equalsIgnoreCase(t.getMcpTransport()))) {
                                throw new IllegalArgumentException("MCP 传输方式仅支持 SSE 或 Streamable HTTP");
                        }
                }
        }
        private void validateSkill(SkillDefinition s) {
                if (s.getName() == null || s.getName().isBlank() || s.getPrompt() == null || s.getPrompt().isBlank()) throw new IllegalArgumentException("Skill 名称和提示词不能为空");
        }
        private void validateHook(HookDefinition hook) {
                if (hook == null || hook.getName() == null || hook.getName().isBlank()) {
                        throw new IllegalArgumentException("钩子名称不能为空");
                }
                if (hook.getRuleType() == null || hook.getRuleType().isBlank()) {
                        throw new IllegalArgumentException("钩子规则类型不能为空");
                }
                if (!List.of("REQUIRE_PERMISSION", "REQUIRE_PAGE_CONTEXT", "KEYWORD_BLOCK", "MAX_MESSAGE_LENGTH")
                                .contains(hook.getRuleType().toUpperCase())) {
                        throw new IllegalArgumentException("不支持的钩子规则类型");
                }
                if (hook.getPhase() == null || !"PRE_AGENT".equalsIgnoreCase(hook.getPhase())) {
                        throw new IllegalArgumentException("钩子执行阶段仅支持 Agent 执行前");
                }
                if (hook.getRuleConfig() == null || hook.getRuleConfig().isBlank()) hook.setRuleConfig("{}");
                try {
                        var config = new com.fasterxml.jackson.databind.ObjectMapper().readTree(hook.getRuleConfig());
                        switch (hook.getRuleType().toUpperCase()) {
                                case "REQUIRE_PERMISSION" -> {
                                        if (config.path("permission").asText("").isBlank())
                                                throw new IllegalArgumentException("权限钩子必须配置 permission");
                                }
                                case "KEYWORD_BLOCK" -> {
                                        if (!config.path("keywords").isArray())
                                                throw new IllegalArgumentException("关键词钩子必须配置 keywords 数组");
                                }
                                case "MAX_MESSAGE_LENGTH" -> {
                                        if (config.path("maxLength").asInt(0) <= 0)
                                                throw new IllegalArgumentException("长度钩子必须配置正整数 maxLength");
                                }
                                default -> { }
                        }
                } catch (Exception error) {
                        if (error instanceof IllegalArgumentException argument) throw argument;
                        throw new IllegalArgumentException("钩子规则配置必须是有效 JSON");
                }
        }
        private void ensureHookNameAvailable(String name, String excludingId) {
                if (name == null || name.isBlank()) return;
                boolean duplicate = hooks.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId)
                                && item.getName() != null && item.getName().trim().equalsIgnoreCase(name.trim()));
                if (duplicate) throw new IllegalArgumentException("钩子名称已存在");
        }
        private void ensureToolNameAvailable(String name, String excludingId) {
                if (name == null || name.isBlank()) return;
                boolean duplicate = tools.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId) && item.getName() != null && item.getName().trim().equalsIgnoreCase(name.trim()));
                if (duplicate) throw new IllegalArgumentException("工具名称已存在");
        }
        private void ensureSkillNameAvailable(String name, String excludingId) {
                if (name == null || name.isBlank()) return;
                boolean duplicate = skills.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId) && item.getName() != null && item.getName().trim().equalsIgnoreCase(name.trim()));
                if (duplicate) throw new IllegalArgumentException("Skill 名称已存在");
        }
        private void validateEndpoint(String endpoint, String missingMessage) {
                if (endpoint == null || endpoint.isBlank()) throw new IllegalArgumentException(missingMessage);
                final URI uri;
                try {
                        uri = URI.create(endpoint.trim());
                } catch (IllegalArgumentException error) {
                        throw new IllegalArgumentException("工具地址格式无效");
                }
                String scheme = uri.getScheme();
                if (!("https".equalsIgnoreCase(scheme) || (allowHttp && "http".equalsIgnoreCase(scheme)))) {
                        throw new IllegalArgumentException("工具服务仅允许 HTTP 或 HTTPS");
                }
                if (uri.getUserInfo() != null || uri.getHost() == null || uri.getRawQuery() != null && uri.getRawQuery().contains("@")) {
                        throw new IllegalArgumentException("工具地址不能包含用户凭据或无效主机");
                }
                if (!allowPrivateNetwork && (isPrivate(uri.getHost()) || resolvesToPrivateAddress(uri.getHost()))) {
                        throw new IllegalArgumentException("当前配置禁止访问内网或本机地址");
                }
                if (isCloudMetadata(uri.getHost())) {
                        throw new IllegalArgumentException("禁止访问云实例元数据地址");
                }
        }
        private boolean isPrivate(String host) {
                String h = host.toLowerCase().replace("[", "").replace("]", "");
                if (h.equals("localhost") || h.equals("::1") || h.equals("0.0.0.0") || h.equals("::")) return true;
                if (h.startsWith("127." ) || h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return true;
                if (h.startsWith("172.")) {
                        try { int second = Integer.parseInt(h.substring(4, h.indexOf('.', 4))); if (second >= 16 && second <= 31) return true; } catch (Exception ignored) { return false; }
                }
                return h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
        }
        private boolean isCloudMetadata(String host) {
                String h = host.toLowerCase().replace("[", "").replace("]", "");
                return h.equals("169.254.169.254") || h.equals("metadata.google.internal") || h.equals("metadata.google.com");
        }
        private boolean resolvesToPrivateAddress(String host) {
                try {
                        for (InetAddress address : InetAddress.getAllByName(host)) {
                                if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress() || address.isSiteLocalAddress()) return true;
                        }
                } catch (Exception ignored) {
                        // DNS failures are handled by the actual request; do not reject a valid
                        // public hostname merely because it is temporarily unresolvable here.
                }
                return false;
        }
}
