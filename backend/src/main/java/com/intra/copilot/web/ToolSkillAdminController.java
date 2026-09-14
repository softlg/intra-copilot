package com.intra.copilot.web;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.SkillToolBinding;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.util.EntityIdGenerator;
import java.net.URI;
import java.net.InetAddress;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class ToolSkillAdminController {
        private final ToolDefinitionRepository tools; private final SkillDefinitionRepository skills; private final SkillToolBindingRepository skillToolBindings; private final AgentDefinitionRepository agents;
        private final boolean allowHttp;
        private final boolean allowPrivateNetwork;
        private static final ObjectMapper JSON = new ObjectMapper();
        public ToolSkillAdminController(
                        ToolDefinitionRepository tools,
                        SkillDefinitionRepository skills,
                        SkillToolBindingRepository skillToolBindings,
                        AgentDefinitionRepository agents,
                        @Value("${tools.allow-http:true}") boolean allowHttp,
                        @Value("${tools.allow-private-network:false}") boolean allowPrivateNetwork) {
                this.tools = tools;
                this.skills = skills;
                this.skillToolBindings = skillToolBindings;
                this.agents = agents;
                this.allowHttp = allowHttp;
                this.allowPrivateNetwork = allowPrivateNetwork;
        }
        @GetMapping("/tools") public List<ToolDefinition> tools() {
                // MCP servers are managed in the dedicated MCP service module.
                return tools.findAll().stream().filter(item -> !"MCP".equalsIgnoreCase(item.getType())).toList();
        }
        @PostMapping("/tools") @ResponseStatus(HttpStatus.CREATED) public ToolDefinition createTool(@RequestBody ToolDefinition t) { validateTool(t); ensureToolNameAvailable(t.getName(), null); t.setName(t.getName().trim()); t.setId(EntityIdGenerator.next("TL")); return tools.save(t); }
        @PutMapping("/tools/{id}") public ToolDefinition updateTool(@PathVariable String id, @RequestBody ToolDefinition t) { tools.findById(id).orElseThrow(() -> new NoSuchElementException("工具不存在：" + id)); t.setId(id); validateTool(t); ensureToolNameAvailable(t.getName(), id); t.setName(t.getName().trim()); t.touch(); return tools.save(t); }
        @PatchMapping("/tools/{id}/enabled") public ToolDefinition toggleTool(@PathVariable String id, @RequestBody EnabledRequest request) {
                ToolDefinition tool = tools.findById(id).orElseThrow(() -> new IllegalArgumentException("工具不存在"));
                tool.setEnabled(request.enabled());
                tool.touch();
                return tools.save(tool);
        }
        @DeleteMapping("/tools/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteTool(@PathVariable String id) { ensureToolNotEnabled(id); ensureToolNotReferenced(id); tools.deleteById(id); }
        private void ensureToolNotEnabled(String id) {
                ToolDefinition item = tools.findById(id).orElseThrow(() -> new IllegalArgumentException("工具不存在"));
                if (item.isEnabled()) throw new IllegalArgumentException("工具处于启用状态，请先停用后再删除");
        }
        private void ensureToolNotReferenced(String id) {
                List<String> agentNames = agents.findAll().stream()
                                .filter(a -> containsToolId(a.getToolIds(), id))
                                .map(a -> a.getDisplayName() == null ? a.getId() : a.getDisplayName())
                                .toList();
                List<String> skillIds = skillToolBindings.findByToolId(id).stream()
                                .map(SkillToolBinding::getSkillId)
                                .distinct()
                                .toList();
                List<SkillDefinition> allSkills = skills.findAll();
                List<String> skillNames = skillIds.stream()
                                .map(skillId -> allSkills.stream()
                                                .filter(skill -> skillId.equals(skill.getId()))
                                                .map(SkillDefinition::getName)
                                                .filter(name -> name != null && !name.isBlank())
                                                .findFirst()
                                                .orElse(skillId))
                                .toList();
                if (!agentNames.isEmpty() || !skillNames.isEmpty()) {
                        StringBuilder msg = new StringBuilder("工具仍被引用，无法删除（请先在对应 Agent / Skill 中解除绑定）：");
                        if (!agentNames.isEmpty()) msg.append(" Agent[").append(String.join("、", agentNames)).append("]");
                        if (!skillNames.isEmpty()) msg.append(" Skill[").append(String.join("、", skillNames)).append("]");
                        throw new IllegalArgumentException(msg.toString());
                }
        }
        private boolean containsToolId(String toolIdsJson, String id) {
                if (toolIdsJson == null || toolIdsJson.isBlank()) return false;
                try {
                        List<String> ids = JSON.readValue(toolIdsJson, new TypeReference<List<String>>() {});
                        return ids != null && ids.contains(id);
                } catch (Exception ignored) {
                        return false;
                }
        }
        public record EnabledRequest(boolean enabled) {}
        private void validateTool(ToolDefinition t) {
                if (t.getName() == null || t.getName().isBlank()) throw new IllegalArgumentException("工具名称不能为空");
                if ("HTTP".equalsIgnoreCase(t.getType())) {
                        validateEndpoint(t.getEndpoint(), "HTTP 工具必须配置 endpoint");
                }
                if ("MCP".equalsIgnoreCase(t.getType())) {
                        throw new IllegalArgumentException("MCP 已独立为 MCP 服务，请在 MCP 服务菜单中配置");
                }
        }
        private void ensureToolNameAvailable(String name, String excludingId) {
                if (name == null || name.isBlank()) return;
                boolean duplicate = tools.findAll().stream().anyMatch(item -> !item.getId().equals(excludingId) && item.getName() != null && item.getName().trim().equalsIgnoreCase(name.trim()));
                if (duplicate) throw new IllegalArgumentException("工具名称已存在");
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
