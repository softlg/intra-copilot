package com.intra.copilot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.HookDefinition;
import com.intra.copilot.repo.HookDefinitionRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Evaluates administrator-configured validation hooks before model execution. */
@Service
public class HookService {
        private final HookDefinitionRepository repository;
        private final ObjectMapper json = new ObjectMapper();

        public HookService(HookDefinitionRepository repository) { this.repository = repository; }

        public List<HookDefinition> all() {
                return repository.findAll().stream()
                                .sorted(Comparator.comparingInt(HookDefinition::getPriority).thenComparing(HookDefinition::getName))
                                .toList();
        }

        public HookResult validate(Context context) {
                for (HookCheck check : checks(context)) {
                        if (!check.passed()) {
                                return new HookResult(false, check.hookId(), check.hookName(), check.message());
                        }
                }
                return new HookResult(true, null, null, null);
        }

        public List<HookCheck> checks(Context context) {
                return all().stream()
                                .filter(hook -> hook.isEnabled() && "PRE_AGENT".equalsIgnoreCase(hook.getPhase()))
                                .map(hook -> {
                                        boolean passed = matches(hook, context);
                                        String message = hook.getFailureMessage();
                                        if (message == null || message.isBlank()) message = "请求未通过校验：" + hook.getName();
                                        return new HookCheck(hook.getId(), hook.getName(), hook.getRuleType(), passed, message);
                                })
                                .toList();
        }

        private boolean matches(HookDefinition hook, Context context) {
                try {
                        JsonNode config = json.readTree(hook.getRuleConfig() == null ? "{}" : hook.getRuleConfig());
                        return switch (hook.getRuleType() == null ? "" : hook.getRuleType().toUpperCase()) {
                                case "REQUIRE_PERMISSION" ->
                                                Boolean.TRUE.equals((context.permissions() == null ? Map.<String, Boolean>of() : context.permissions())
                                                                .get(config.path("permission").asText("readPage")));
                                case "REQUIRE_PAGE_CONTEXT" -> context.pageContext() != null && !context.pageContext().isBlank();
                                case "KEYWORD_BLOCK" -> {
                                        String text = context.message() == null ? "" : context.message().toLowerCase();
                                        boolean found = config.path("keywords").isArray()
                                                        && java.util.stream.StreamSupport.stream(config.path("keywords").spliterator(), false)
                                                                        .map(JsonNode::asText)
                                                                        .filter(value -> !value.isBlank())
                                                                        .anyMatch(text::contains);
                                        yield !found;
                                }
                                case "MAX_MESSAGE_LENGTH" -> context.message() != null
                                                && context.message().length() <= config.path("maxLength").asInt(4000);
                                default -> false;
                        };
                } catch (Exception ignored) {
                        // A malformed hook must fail closed instead of silently bypassing a policy.
                        return false;
                }
        }

        public record Context(
                        String message,
                        String pageContext,
                        String agentId,
                        Map<String, Boolean> permissions) {}

        public record HookResult(boolean allowed, String hookId, String hookName, String message) {}

        public record HookCheck(String hookId, String hookName, String ruleType, boolean passed, String message) {}
}
