package com.intra.copilot.web;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.SkillDefinition;
import com.intra.copilot.model.SkillToolBinding;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.SkillDefinitionRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.service.BrowserActionValidator;
import com.intra.copilot.service.ToolExecutor;
import com.intra.copilot.service.auth.RequestContext;
import com.intra.copilot.util.EntityIdGenerator;
import java.net.InetAddress;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class ToolSkillAdminController {
    private final ToolDefinitionRepository tools;
    private final SkillDefinitionRepository skills;
    private final SkillToolBindingRepository skillToolBindings;
    private final AgentDefinitionRepository agents;
    private final ToolExecutor toolExecutor;
    private final boolean allowHttp;
    private final boolean allowPrivateNetwork;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String TOOL_NAME_PATTERN = "[A-Za-z0-9_-]{1,64}";
    private static final List<String> HTTP_METHODS =
            List.of("GET", "POST", "PUT", "PATCH", "DELETE");
    private static final Pattern PATH_PARAMETER = Pattern.compile("\\{([A-Za-z0-9_.-]+)}");

    public ToolSkillAdminController(
            ToolDefinitionRepository tools,
            SkillDefinitionRepository skills,
            SkillToolBindingRepository skillToolBindings,
            AgentDefinitionRepository agents,
            ToolExecutor toolExecutor,
            @Value("${tools.allow-http:true}") boolean allowHttp,
            @Value("${tools.allow-private-network:false}") boolean allowPrivateNetwork) {
        this.tools = tools;
        this.skills = skills;
        this.skillToolBindings = skillToolBindings;
        this.agents = agents;
        this.toolExecutor = toolExecutor;
        this.allowHttp = allowHttp;
        this.allowPrivateNetwork = allowPrivateNetwork;
    }

    @GetMapping("/tools")
    public List<ToolDefinition> tools() {
        // MCP servers are managed in the dedicated MCP service module.
        return tools.findAll()
                .stream()
                .filter(item -> !"MCP".equalsIgnoreCase(item.getType()))
                .toList();
    }

    @PostMapping("/tools")
    @ResponseStatus(HttpStatus.CREATED)
    public ToolDefinition createTool(@RequestBody ToolDefinition t) {
        ensureToolNameAvailable(t.getName(), null);
        validateTool(t);
        ToolDefinition created = new ToolDefinition();
        created.setId(EntityIdGenerator.next("TL"));
        applyEditableFields(created, t);
        String actor = RequestContext.currentOrAnonymous().actorLabel();
        created.setCreatedBy(actor);
        created.setUpdatedBy(actor);
        return tools.save(created);
    }

    @PutMapping("/tools/{id}")
    public ToolDefinition updateTool(@PathVariable String id, @RequestBody ToolDefinition t) {
        ToolDefinition current =
                tools.findById(id).orElseThrow(() -> new NoSuchElementException("Tool 不存在：" + id));
        validateTool(t);
        ensureToolNameAvailable(t.getName(), id);
        applyEditableFields(current, t);
        current.setUpdatedBy(RequestContext.currentOrAnonymous().actorLabel());
        current.touch();
        return tools.save(current);
    }

    @PatchMapping("/tools/{id}/enabled")
    public ToolDefinition toggleTool(@PathVariable String id, @RequestBody EnabledRequest request) {
        ToolDefinition tool =
                tools.findById(id).orElseThrow(() -> new IllegalArgumentException("Tool 不存在"));
        tool.setEnabled(request.enabled());
        tool.setUpdatedBy(RequestContext.currentOrAnonymous().actorLabel());
        tool.touch();
        return tools.save(tool);
    }

    @PostMapping("/tools/{id}/test")
    public Map<String, Object> testTool(
            @PathVariable String id, @RequestBody(required = false) ToolTestRequest request) {
        ToolDefinition tool =
                tools.findById(id).orElseThrow(() -> new NoSuchElementException("Tool 不存在：" + id));
        ToolExecutor.ToolExecutionResult result =
                toolExecutor.executeDetailed(tool, request == null ? "{}" : request.arguments());
        return Map.of("success", result.success(), "output", result.output());
    }

    @DeleteMapping("/tools/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTool(@PathVariable String id) {
        ensureToolNotEnabled(id);
        ensureToolNotReferenced(id);
        tools.deleteById(id);
    }

    private void ensureToolNotEnabled(String id) {
        ToolDefinition item =
                tools.findById(id).orElseThrow(() -> new IllegalArgumentException("Tool 不存在"));
        if (item.isEnabled()) throw new IllegalArgumentException("Tool 处于启用状态，请先停用后再删除");
    }

    private void ensureToolNotReferenced(String id) {
        List<String> agentNames =
                agents.findAll()
                        .stream()
                        .filter(a -> containsToolId(a.getToolIds(), id))
                        .map(a -> a.getDisplayName() == null ? a.getId() : a.getDisplayName())
                        .toList();
        List<String> skillIds =
                skillToolBindings
                        .findByToolId(id)
                        .stream()
                        .map(SkillToolBinding::getSkillId)
                        .distinct()
                        .toList();
        List<SkillDefinition> allSkills = skills.findAll();
        List<String> skillNames =
                skillIds.stream()
                        .map(
                                skillId ->
                                        allSkills
                                                .stream()
                                                .filter(skill -> skillId.equals(skill.getId()))
                                                .map(SkillDefinition::getName)
                                                .filter(name -> name != null && !name.isBlank())
                                                .findFirst()
                                                .orElse(skillId))
                        .toList();
        if (!agentNames.isEmpty() || !skillNames.isEmpty()) {
            StringBuilder msg = new StringBuilder("Tool 仍被引用，无法删除（请先在对应 Agent / Skill 中解除绑定）：");
            if (!agentNames.isEmpty())
                msg.append(" Agent[").append(String.join("、", agentNames)).append("]");
            if (!skillNames.isEmpty())
                msg.append(" Skill[").append(String.join("、", skillNames)).append("]");
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

    public record ToolTestRequest(String arguments) {}

    private void validateTool(ToolDefinition t) {
        if (t.getName() == null || t.getName().isBlank())
            throw new IllegalArgumentException("Tool 名称不能为空");
        if (!t.getName().trim().matches(TOOL_NAME_PATTERN)) {
            throw new IllegalArgumentException("Tool 名称只能使用 1-64 位字母、数字、下划线或连字符");
        }
        if (t.getDescription() != null && t.getDescription().length() > 500) {
            throw new IllegalArgumentException("Tool 描述不能超过 500 个字符");
        }
        String type = t.getType() == null ? "" : t.getType().trim().toUpperCase();
        if (!List.of("HTTP", "BROWSER_PROPOSAL").contains(type)) {
            throw new IllegalArgumentException("Tool 类型无效");
        }
        if (t.getParameterSchema() != null && !t.getParameterSchema().isBlank()) {
            validateSchema(t.getParameterSchema());
        }
        int timeout = t.getTimeoutMs() == null ? 10000 : t.getTimeoutMs();
        if (timeout < 500 || timeout > 60000) {
            throw new IllegalArgumentException("Tool 超时必须在 500-60000 毫秒之间");
        }
        if ("HTTP".equals(type)) {
            validateEndpoint(t.getEndpoint(), "HTTP Tool 必须配置 endpoint");
            String method = t.getMethod() == null ? "POST" : t.getMethod().trim().toUpperCase();
            if (!HTTP_METHODS.contains(method)) {
                throw new IllegalArgumentException("HTTP 方法无效");
            }
            validateAuth(t);
        } else if ("BROWSER_PROPOSAL".equals(type)) {
            BrowserActionValidator.validateSchema(t.getParameterSchema());
        }
    }

    private void validateSchema(String schema) {
        if (schema.length() > 20000) {
            throw new IllegalArgumentException("参数 Schema 不能超过 20000 个字符");
        }
        try {
            var root = JSON.readTree(schema);
            if (!root.isObject()) {
                throw new IllegalArgumentException("参数 Schema 必须是 JSON 对象");
            }
            if (root.has("type") && !"object".equals(root.path("type").asText())) {
                throw new IllegalArgumentException("参数 Schema 的 type 必须为 object");
            }
            if (root.has("properties") && !root.path("properties").isObject()) {
                throw new IllegalArgumentException("参数 Schema 的 properties 必须是对象");
            }
            if (root.has("required") && !root.path("required").isArray()) {
                throw new IllegalArgumentException("参数 Schema 的 required 必须是数组");
            }
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("参数 Schema 不是有效 JSON");
        }
    }

    private void validateAuth(ToolDefinition t) {
        String header = trimToNull(t.getAuthHeaderName());
        String env = trimToNull(t.getAuthEnv());
        if ((header == null) != (env == null)) {
            throw new IllegalArgumentException("认证 Header 和环境变量必须同时配置");
        }
        if (header != null && !header.matches("[A-Za-z0-9-]{1,160}")) {
            throw new IllegalArgumentException("认证 Header 名称无效");
        }
        if (env != null && !env.matches("[A-Za-z_][A-Za-z0-9_]{0,159}")) {
            throw new IllegalArgumentException("认证环境变量名称无效");
        }
    }

    private void applyEditableFields(ToolDefinition current, ToolDefinition value) {
        current.setName(value.getName().trim());
        current.setDescription(trimToNull(value.getDescription()));
        String type = value.getType() == null ? "HTTP" : value.getType().trim().toUpperCase();
        current.setType(type);
        if ("HTTP".equals(type)) {
            current.setMethod(
                    value.getMethod() == null ? "POST" : value.getMethod().trim().toUpperCase());
            current.setEndpoint(value.getEndpoint().trim());
            current.setAuthHeaderName(trimToNull(value.getAuthHeaderName()));
            current.setAuthEnv(trimToNull(value.getAuthEnv()));
            current.setAuthScheme(trimToNull(value.getAuthScheme()));
        } else {
            current.setMethod(null);
            current.setEndpoint(null);
            current.setAuthHeaderName(null);
            current.setAuthEnv(null);
            current.setAuthScheme(null);
        }
        current.setParameterSchema(
                value.getParameterSchema() == null || value.getParameterSchema().isBlank()
                        ? (current.getParameterSchema() == null
                                ? "{}"
                                : current.getParameterSchema())
                        : value.getParameterSchema().trim());
        current.setTimeoutMs(
                value.getTimeoutMs() == null
                        ? (current.getTimeoutMs() == null ? 10000 : current.getTimeoutMs())
                        : value.getTimeoutMs());
        current.setEnabled(value.isEnabled());
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void ensureToolNameAvailable(String name, String excludingId) {
        if (name == null || name.isBlank()) return;
        boolean duplicate =
                tools.findAll()
                        .stream()
                        .anyMatch(
                                item ->
                                        !item.getId().equals(excludingId)
                                                && item.getName() != null
                                                && item.getName()
                                                        .trim()
                                                        .equalsIgnoreCase(name.trim()));
        if (duplicate) throw new IllegalArgumentException("Tool 名称已存在");
    }

    private void validateEndpoint(String endpoint, String missingMessage) {
        if (endpoint == null || endpoint.isBlank())
            throw new IllegalArgumentException(missingMessage);
        if (hasAuthorityPlaceholder(endpoint.trim())) {
            throw new IllegalArgumentException("Tool 地址占位符只能用于路径或查询参数");
        }
        final URI uri;
        try {
            uri = URI.create(PATH_PARAMETER.matcher(endpoint.trim()).replaceAll("placeholder"));
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Tool 地址格式无效");
        }
        String scheme = uri.getScheme();
        if (!("https".equalsIgnoreCase(scheme) || (allowHttp && "http".equalsIgnoreCase(scheme)))) {
            throw new IllegalArgumentException("Tool 服务仅允许 HTTP 或 HTTPS");
        }
        if (uri.getUserInfo() != null
                || uri.getHost() == null
                || uri.getRawQuery() != null && uri.getRawQuery().contains("@")) {
            throw new IllegalArgumentException("Tool 地址不能包含用户凭据或无效主机");
        }
        if (!allowPrivateNetwork
                && (isPrivate(uri.getHost()) || resolvesToPrivateAddress(uri.getHost()))) {
            throw new IllegalArgumentException("当前配置禁止访问内网或本机地址");
        }
        if (isCloudMetadata(uri.getHost())) {
            throw new IllegalArgumentException("禁止访问云实例元数据地址");
        }
    }

    private boolean hasAuthorityPlaceholder(String endpoint) {
        int schemeEnd = endpoint.indexOf("://");
        if (schemeEnd < 0) return false;
        int authorityStart = schemeEnd + 3;
        int authorityEnd = endpoint.length();
        for (int index = authorityStart; index < endpoint.length(); index++) {
            char value = endpoint.charAt(index);
            if (value == '/' || value == '?' || value == '#') {
                authorityEnd = index;
                break;
            }
        }
        String authority = endpoint.substring(authorityStart, authorityEnd);
        return authority.contains("{") || authority.contains("}");
    }

    private boolean isPrivate(String host) {
        String h = host.toLowerCase().replace("[", "").replace("]", "");
        if (h.equals("localhost") || h.equals("::1") || h.equals("0.0.0.0") || h.equals("::"))
            return true;
        if (h.startsWith("127.")
                || h.startsWith("10.")
                || h.startsWith("192.168.")
                || h.startsWith("169.254.")) return true;
        if (h.startsWith("172.")) {
            try {
                int second = Integer.parseInt(h.substring(4, h.indexOf('.', 4)));
                if (second >= 16 && second <= 31) return true;
            } catch (Exception ignored) {
                return false;
            }
        }
        return h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
    }

    private boolean isCloudMetadata(String host) {
        String h = host.toLowerCase().replace("[", "").replace("]", "");
        return h.equals("169.254.169.254")
                || h.equals("metadata.google.internal")
                || h.equals("metadata.google.com");
    }

    private boolean resolvesToPrivateAddress(String host) {
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (address.isAnyLocalAddress()
                        || address.isLoopbackAddress()
                        || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress()) return true;
            }
        } catch (Exception ignored) {
            // DNS failures are handled by the actual request; do not reject a valid
            // public hostname merely because it is temporarily unresolvable here.
        }
        return false;
    }
}
