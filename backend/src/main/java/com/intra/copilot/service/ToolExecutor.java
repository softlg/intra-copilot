package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.McpServerRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

/**
 * Executes a configured {@link ToolDefinition} as a real action.
 *
 * <p>HTTP tools support path placeholders, query parameters for GET/DELETE,
 * JSON bodies for POST/PUT/PATCH, environment-backed authentication headers,
 * strict argument validation, and no automatic redirect following.
 */
@Service
public class ToolExecutor {
    private static final Pattern PATH_PARAMETER = Pattern.compile("\\{([A-Za-z0-9_.-]+)}");
    private static final Set<String> QUERY_METHODS = Set.of("GET", "DELETE");
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH");
    private static final int MAX_RESULT_CHARS = 8000;

    private final ToolDefinitionRepository toolRepository;
    private final McpServerRepository mcpRepository;
    private final McpServerService mcpService;
    private final RestClient.Builder restClientBuilder;
    private final ObjectMapper json;
    private final boolean allowPrivateNetwork;

    public ToolExecutor(
            ToolDefinitionRepository toolRepository,
            McpServerRepository mcpRepository,
            McpServerService mcpService,
            RestClient.Builder restClientBuilder,
            ObjectMapper json,
            @Value("${tools.allow-private-network:false}") boolean allowPrivateNetwork) {
        this.toolRepository = toolRepository;
        this.mcpRepository = mcpRepository;
        this.mcpService = mcpService;
        this.restClientBuilder = restClientBuilder;
        this.json = json;
        this.allowPrivateNetwork = allowPrivateNetwork;
    }

    public record ToolExecutionResult(boolean success, String output) {}

    public ToolDefinition resolveById(String id) {
        if (id == null || id.isBlank()) return null;
        return toolRepository.findById(id).filter(ToolDefinition::isEnabled).orElse(null);
    }

    public ToolDefinition resolveWithin(List<String> allowedIds, String name) {
        if (name == null || name.isBlank() || allowedIds == null || allowedIds.isEmpty()) return null;
        for (String id : allowedIds) {
            ToolDefinition def = resolveById(id);
            if (def != null && name.equals(def.getName())) return def;
        }
        return null;
    }

    public String execute(ToolDefinition def, String argumentsJson) {
        return executeDetailed(def, argumentsJson).output();
    }

    public ToolExecutionResult executeDetailed(ToolDefinition def, String argumentsJson) {
        if (def == null) return failure("工具定义不存在");
        try {
            return switch (def.getType() == null ? "" : def.getType().toUpperCase(Locale.ROOT)) {
                case "MCP" -> executeMcp(def, argumentsJson);
                case "BROWSER_PROPOSAL" -> success(
                        "BROWSER_PROPOSAL:" + truncate(argumentsJson == null ? "{}" : argumentsJson));
                case "HTTP" -> executeHttp(def, argumentsJson);
                default -> failure("不支持的工具类型：" + def.getType());
            };
        } catch (Exception error) {
            return failure("工具执行失败：" + safeMessage(error));
        }
    }

    public String redactArguments(ToolDefinition def, String argumentsJson) {
        if (argumentsJson == null || argumentsJson.isBlank()) return "{}";
        try {
            JsonNode root = json.readTree(argumentsJson);
            if (!root.isObject()) return argumentsJson;
            ObjectNode redacted = root.deepCopy();
            redactObject(redacted);
            return json.writeValueAsString(redacted);
        } catch (Exception ignored) {
            return argumentsJson;
        }
    }

    private void redactObject(ObjectNode object) {
        Iterator<Map.Entry<String, JsonNode>> fields = object.fields();
        List<String> sensitive = new ArrayList<>();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            String key = field.getKey().toLowerCase(Locale.ROOT);
            if (key.contains("password")
                    || key.contains("secret")
                    || key.contains("token")
                    || key.contains("apikey")
                    || key.contains("api_key")
                    || key.contains("authorization")
                    || key.contains("credential")) {
                sensitive.add(field.getKey());
            } else if (field.getValue().isObject()) {
                redactObject((ObjectNode) field.getValue());
            }
        }
        sensitive.forEach(key -> object.put(key, "[REDACTED]"));
    }

    private ToolExecutionResult executeHttp(ToolDefinition def, String argumentsJson) throws Exception {
        String endpoint = def.getEndpoint();
        if (endpoint == null || endpoint.isBlank()) return failure("工具未配置 endpoint");
        if (hasAuthorityPlaceholder(endpoint.trim())) {
            return failure("工具地址占位符只能用于路径或查询参数");
        }

        String checkUrl = PATH_PARAMETER.matcher(endpoint.trim()).replaceAll("placeholder");
        URI checkedUri;
        try {
            checkedUri = URI.create(checkUrl);
        } catch (IllegalArgumentException error) {
            return failure("工具 endpoint 格式无效");
        }
        String validationError = validateRemoteUri(checkedUri);
        if (validationError != null) return failure(validationError);

        JsonNode schema = readSchema(def.getParameterSchema());
        ObjectNode arguments = parseArguments(argumentsJson);
        String schemaError = validateAgainstSchema(arguments, schema, "arguments");
        if (schemaError != null) return failure("工具参数无效：" + schemaError);

        RequestParts request = buildRequest(endpoint.trim(), def, arguments);
        if (request.error() != null) return failure(request.error());

        HttpMethod method;
        try {
            method =
                    HttpMethod.valueOf(
                            def.getMethod() == null
                                    ? "POST"
                                    : def.getMethod().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException error) {
            return failure("HTTP 方法无效：" + def.getMethod());
        }

        int timeout =
                def.getTimeoutMs() == null
                        ? 10000
                        : Math.max(500, Math.min(60000, def.getTimeoutMs()));
        HttpClient httpClient =
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofMillis(timeout))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofMillis(timeout));
        RestClient client = restClientBuilder.clone().requestFactory(factory).build();

        RestClient.RequestHeadersSpec<?> spec =
                client.method(method)
                        .uri(request.uri())
                        .accept(MediaType.APPLICATION_JSON)
                        .headers(headers -> applyAuthHeader(def, headers));

        if (BODY_METHODS.contains(method.name())) {
            spec =
                    ((RestClient.RequestBodySpec) spec)
                .contentType(MediaType.APPLICATION_JSON)
                            .body(request.body());
    }

        return spec.exchange(
                (req, response) -> {
                    String body =
                            response.getBody() == null
                                    ? ""
                                    : new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
                    if (!response.getStatusCode().is2xxSuccessful()) {
                        String detail = body.isBlank() ? response.getStatusText() : body;
                        return failure(
                                "工具 HTTP "
                                        + response.getStatusCode().value()
                                        + "："
                                        + truncate(detail));
                    }
                    return success(truncate(body));
                });
    }

    private RequestParts buildRequest(
            String endpoint, ToolDefinition def, ObjectNode arguments) throws Exception {
        ObjectNode remaining = arguments.deepCopy();
        Matcher matcher = PATH_PARAMETER.matcher(endpoint);
        StringBuffer resolved = new StringBuffer();
        while (matcher.find()) {
            String name = matcher.group(1);
            JsonNode value = remaining.get(name);
            if (value == null || value.isNull()) {
                return new RequestParts(null, null, "工具参数缺少路径变量：" + name);
            }
            String encoded = UriUtils.encodePathSegment(asQueryValue(value), StandardCharsets.UTF_8);
            matcher.appendReplacement(resolved, Matcher.quoteReplacement(encoded));
            remaining.remove(name);
    }
        matcher.appendTail(resolved);

        String method =
                def.getMethod() == null
                        ? "POST"
                        : def.getMethod().trim().toUpperCase(Locale.ROOT);
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(resolved.toString());
        Object body = null;
        if (QUERY_METHODS.contains(method)) {
            Iterator<Map.Entry<String, JsonNode>> fields = remaining.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (field.getValue().isArray()) {
                    for (JsonNode value : field.getValue()) {
                        builder.queryParam(field.getKey(), asQueryValue(value));
                    }
                } else {
                    builder.queryParam(field.getKey(), asQueryValue(field.getValue()));
                }
            }
        } else if (BODY_METHODS.contains(method)) {
            body = remaining;
        } else {
            return new RequestParts(null, null, "不支持将参数映射到 HTTP 方法：" + method);
        }
        return new RequestParts(builder.build().encode(StandardCharsets.UTF_8).toUri(), body, null);
    }

    private String asQueryValue(JsonNode value) {
        if (value == null || value.isNull()) return "";
        if (value.isValueNode()) return value.asText();
        try {
            return json.writeValueAsString(value);
        } catch (Exception ignored) {
            return value.toString();
        }
    }

    private void applyAuthHeader(ToolDefinition def, HttpHeaders headers) {
        String envName = trimToNull(def.getAuthEnv());
        String headerName = trimToNull(def.getAuthHeaderName());
        if (envName == null || headerName == null) return;
        String secret = System.getenv(envName);
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("认证环境变量未配置：" + envName);
        }
        String scheme = trimToNull(def.getAuthScheme());
        headers.set(headerName, scheme == null ? secret : scheme + " " + secret);
    }

    private ObjectNode parseArguments(String argumentsJson) throws Exception {
        JsonNode root =
                json.readTree(
                        argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson);
        if (!root.isObject()) {
            throw new IllegalArgumentException("工具参数必须是 JSON 对象");
        }
        return (ObjectNode) root;
    }

    private JsonNode readSchema(String schemaJson) {
        if (schemaJson == null || schemaJson.isBlank()) return json.createObjectNode();
        try {
            JsonNode root = json.readTree(schemaJson);
            return root != null && root.isObject() ? root : json.createObjectNode();
        } catch (Exception ignored) {
            return json.createObjectNode();
        }
    }

    private String validateAgainstSchema(JsonNode value, JsonNode schema, String path) {
        if (schema == null || !schema.isObject()) return null;
        String type = schema.path("type").asText("");
        String typeError = validateType(value, type, path);
        if (typeError != null) return typeError;

        if (schema.has("enum") && schema.path("enum").isArray()) {
            boolean matched = false;
            for (JsonNode allowed : schema.path("enum")) {
                if (allowed.equals(value)) {
                    matched = true;
                    break;
                }
            }
            if (!matched) return path + " 不在允许的取值范围内";
        }

        if ("object".equals(type)) {
            JsonNode required = schema.path("required");
            if (required.isArray()) {
                for (JsonNode field : required) {
                    String name = field.asText();
                    if (name.isBlank() || !value.has(name) || value.path(name).isNull()) {
                        return path + " 缺少必填参数：" + name;
                    }
                }
            }
            JsonNode properties = schema.path("properties");
            if (properties.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> fields = properties.fields();
                while (fields.hasNext()) {
                    Map.Entry<String, JsonNode> field = fields.next();
                    if (!value.has(field.getKey())) continue;
                    String error =
                            validateAgainstSchema(
                                    value.path(field.getKey()),
                                    field.getValue(),
                                    path + "." + field.getKey());
                    if (error != null) return error;
                }
            }
        } else if ("array".equals(type) && value.isArray() && schema.has("items")) {
            for (int index = 0; index < value.size(); index++) {
                String error =
                        validateAgainstSchema(
                                value.get(index), schema.path("items"), path + "[" + index + "]");
                if (error != null) return error;
            }
        }
        return null;
    }

    private String validateType(JsonNode value, String type, String path) {
        if (type == null || type.isBlank()) return null;
        boolean valid =
                switch (type) {
                    case "object" -> value.isObject();
                    case "array" -> value.isArray();
                    case "string" -> value.isTextual();
                    case "integer" -> value.isIntegralNumber();
                    case "number" -> value.isNumber();
                    case "boolean" -> value.isBoolean();
                    case "null" -> value.isNull();
                    default -> true;
                };
        return valid ? null : path + " 类型应为 " + type;
    }

    private ToolExecutionResult executeMcp(ToolDefinition def, String argumentsJson) {
        String serverId = def.getMcpServerId();
        if (serverId == null || serverId.isBlank()) return failure("MCP 工具未绑定 mcpServerId");
        McpServer server = mcpRepository.findById(serverId).orElse(null);
        if (server == null) return failure("未找到 MCP 服务：" + serverId);
        if (!server.isEnabled()) return failure("MCP 服务未启用：" + serverId);
        String remoteName =
                def.getRemoteName() == null || def.getRemoteName().isBlank()
                        ? def.getName()
                        : def.getRemoteName();
        return success(mcpService.callTool(server, remoteName, argumentsJson));
    }

    private String validateRemoteUri(URI uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!List.of("http", "https").contains(scheme)) return "仅支持 http/https endpoint";
        if (uri.getHost() == null || uri.getUserInfo() != null) return "工具地址不能包含用户凭据或无效主机";
        if (isCloudMetadata(uri.getHost())) return "禁止访问云实例元数据地址";
        if (!allowPrivateNetwork && isPrivateHost(uri.getHost())) {
            return "当前配置禁止访问内网/本机工具地址";
        }
        return null;
    }

    private boolean isPrivateHost(String host) {
        if (host == null) return true;
        String normalized = host.toLowerCase(Locale.ROOT).replace("[", "").replace("]", "");
        if (normalized.equals("localhost")
                || normalized.equals("::1")
                || normalized.equals("0.0.0.0")
                || normalized.equals("::")) {
            return true;
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (address.isAnyLocalAddress()
                        || address.isLoopbackAddress()
                        || address.isLinkLocalAddress()
                        || address.isSiteLocalAddress()) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            // The actual request will surface DNS failures.
        }
        return false;
    }

    private boolean isCloudMetadata(String host) {
        String normalized = host.toLowerCase(Locale.ROOT).replace("[", "").replace("]", "");
        return normalized.equals("169.254.169.254")
                || normalized.equals("metadata.google.internal")
                || normalized.equals("metadata.google.com");
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

    private ToolExecutionResult success(String output) {
        return new ToolExecutionResult(true, truncate(output == null ? "" : output));
    }

    private ToolExecutionResult failure(String output) {
        return new ToolExecutionResult(false, truncate(output == null ? "工具执行失败" : output));
    }

    private String truncate(String text) {
        return text == null
                ? ""
                : (text.length() <= MAX_RESULT_CHARS
                        ? text
                        : text.substring(0, MAX_RESULT_CHARS) + "\n...[truncated]");
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String safeMessage(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private record RequestParts(URI uri, Object body, String error) {}
}
