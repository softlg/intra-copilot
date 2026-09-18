package com.intra.copilot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.ToolDefinitionRepository;
import com.intra.copilot.service.auth.RequestContext;
import com.intra.copilot.util.EntityIdGenerator;
import java.net.InetAddress;
import java.net.URI;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Server-side Tool creation used by Copilot proposals.
 *
 * <p>Generated tools are always disabled. They can only be enabled after the administrator runs the
 * existing Tool test successfully.
 */
@Service
public class ToolManagementService {
    private static final Pattern TOOL_NAME_PATTERN = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final Pattern PATH_PARAMETER = Pattern.compile("\\{([A-Za-z0-9_.-]+)}");
    private static final List<String> HTTP_METHODS =
            List.of("GET", "POST", "PUT", "PATCH", "DELETE");

    private final ToolDefinitionRepository tools;
    private final ObjectMapper json;
    private final boolean allowHttp;
    private final boolean allowPrivateNetwork;

    public ToolManagementService(
            ToolDefinitionRepository tools,
            ObjectMapper json,
            @Value("${tools.allow-http:true}") boolean allowHttp,
            @Value("${tools.allow-private-network:false}") boolean allowPrivateNetwork) {
        this.tools = tools;
        this.json = json;
        this.allowHttp = allowHttp;
        this.allowPrivateNetwork = allowPrivateNetwork;
    }

    public ToolDefinition createDisabled(ToolDefinition input) {
        ToolDefinition tool = new ToolDefinition();
        tool.setId(EntityIdGenerator.next("TL"));
        applyEditableFields(tool, input);
        tool.setEnabled(false);
        String actor = RequestContext.currentOrAnonymous().actorLabel();
        tool.setCreatedBy(actor);
        tool.setUpdatedBy(actor);
        validate(tool);
        ensureNameAvailable(tool.getName(), null);
        return tools.save(tool);
    }

    private void applyEditableFields(ToolDefinition current, ToolDefinition value) {
        if (value == null) throw new IllegalArgumentException("Tool 配置不能为空");
        current.setName(trimToNull(value.getName()));
        current.setDescription(trimToNull(value.getDescription()));
        String type =
                value.getType() == null ? "BROWSER_PROPOSAL" : value.getType().trim().toUpperCase();
        current.setType(type);
        if ("HTTP".equals(type)) {
            current.setMethod(
                    value.getMethod() == null ? "POST" : value.getMethod().trim().toUpperCase());
            current.setEndpoint(trimToNull(value.getEndpoint()));
            current.setAuthHeaderName(trimToNull(value.getAuthHeaderName()));
            current.setAuthEnv(trimToNull(value.getAuthEnv()));
            current.setAuthScheme(trimToNull(value.getAuthScheme()));
        }
        current.setParameterSchema(
                value.getParameterSchema() == null || value.getParameterSchema().isBlank()
                        ? "{}"
                        : value.getParameterSchema().trim());
        current.setTimeoutMs(value.getTimeoutMs() == null ? 10000 : value.getTimeoutMs());
        current.setEnabled(false);
    }

    private void validate(ToolDefinition tool) {
        if (tool.getName() == null || !TOOL_NAME_PATTERN.matcher(tool.getName()).matches()) {
            throw new IllegalArgumentException("Tool 名称只能使用 1-64 位字母、数字、下划线或连字符");
        }
        if (tool.getDescription() != null && tool.getDescription().length() > 500) {
            throw new IllegalArgumentException("Tool 描述不能超过 500 个字符");
        }
        String type = tool.getType() == null ? "" : tool.getType().toUpperCase();
        if (!List.of("HTTP", "BROWSER_PROPOSAL").contains(type)) {
            throw new IllegalArgumentException("Copilot 仅支持创建 HTTP 或浏览器动作 Tool");
        }
        if (tool.getParameterSchema() != null && !tool.getParameterSchema().isBlank()) {
            validateSchema(tool.getParameterSchema());
        }
        int timeout = tool.getTimeoutMs() == null ? 10000 : tool.getTimeoutMs();
        if (timeout < 500 || timeout > 60000) {
            throw new IllegalArgumentException("Tool 超时必须在 500-60000 毫秒之间");
        }
        if ("HTTP".equals(type)) {
            validateEndpoint(tool.getEndpoint());
            String method = tool.getMethod() == null ? "POST" : tool.getMethod().toUpperCase();
            if (!HTTP_METHODS.contains(method)) {
                throw new IllegalArgumentException("HTTP 方法无效");
            }
            validateAuth(tool);
        } else if ("BROWSER_PROPOSAL".equals(type)) {
            BrowserActionValidator.validateSchema(tool.getParameterSchema());
        }
    }

    private void validateSchema(String schema) {
        if (schema.length() > 20000) {
            throw new IllegalArgumentException("参数 Schema 不能超过 20000 个字符");
        }
        try {
            var root = json.readTree(schema);
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

    private void validateAuth(ToolDefinition tool) {
        String header = tool.getAuthHeaderName();
        String env = tool.getAuthEnv();
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

    private void validateEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            throw new IllegalArgumentException("HTTP Tool 必须配置 endpoint");
        }
        if (hasAuthorityPlaceholder(endpoint)) {
            throw new IllegalArgumentException("Tool 地址占位符只能用于路径或查询参数");
        }
        URI uri;
        try {
            uri = URI.create(PATH_PARAMETER.matcher(endpoint).replaceAll("placeholder"));
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

    private void ensureNameAvailable(String name, String excludingId) {
        boolean duplicate =
                tools.findAll()
                        .stream()
                        .anyMatch(
                                item ->
                                        !item.getId().equals(excludingId)
                                                && item.getName() != null
                                                && item.getName().equalsIgnoreCase(name));
        if (duplicate) throw new IllegalArgumentException("Tool 名称已存在");
    }

    private boolean isPrivate(String host) {
        String value = host.toLowerCase().replace("[", "").replace("]", "");
        if (value.equals("localhost")
                || value.equals("::1")
                || value.equals("0.0.0.0")
                || value.equals("::")) return true;
        if (value.startsWith("127.")
                || value.startsWith("10.")
                || value.startsWith("192.168.")
                || value.startsWith("169.254.")) return true;
        if (value.startsWith("172.")) {
            try {
                int second = Integer.parseInt(value.substring(4, value.indexOf('.', 4)));
                return second >= 16 && second <= 31;
            } catch (RuntimeException ignored) {
                return false;
            }
        }
        return value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
    }

    private boolean isCloudMetadata(String host) {
        String value = host.toLowerCase().replace("[", "").replace("]", "");
        return value.equals("169.254.169.254")
                || value.equals("metadata.google.internal")
                || value.equals("metadata.google.com");
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
            // The actual request reports DNS failures; do not reject temporarily unresolved hosts.
        }
        return false;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
