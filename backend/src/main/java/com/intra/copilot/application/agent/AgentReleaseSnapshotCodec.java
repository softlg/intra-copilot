package com.intra.copilot.application.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.AgentChildBinding;
import com.intra.copilot.domain.agent.AgentDefinition;
import com.intra.copilot.domain.agent.AgentReleaseSnapshot;
import java.util.List;
import org.springframework.stereotype.Component;
import com.intra.copilot.domain.agent.Agent;

/** Reads and writes the immutable payload used to run a published Agent version. */
@Component
public class AgentReleaseSnapshotCodec {
    private final ObjectMapper json;

    public AgentReleaseSnapshotCodec(ObjectMapper json) {
        this.json = json;
    }

    public String encode(AgentDefinition definition, List<AgentChildBinding> childBindings) {
        try {
            return json.writeValueAsString(
                    new AgentReleaseSnapshot(
                            AgentReleaseSnapshot.CURRENT_SCHEMA_VERSION,
                            definition,
                            childBindings));
        } catch (Exception error) {
            throw new IllegalArgumentException("Agent 版本快照无法生成", error);
        }
    }

    public Decoded decode(String raw) {
        if (raw == null || raw.isBlank()) return Decoded.empty();
        try {
            JsonNode root = json.readTree(raw);
            if (root == null || root.isNull()) return Decoded.empty();
            JsonNode definitionNode = root.get("definition");
            if (definitionNode != null && definitionNode.isObject()) {
                AgentDefinition definition = json.treeToValue(definitionNode, AgentDefinition.class);
                List<AgentChildBinding> bindings =
                        root.path("childBindings").isArray()
                                ? json.convertValue(
                                        root.path("childBindings"),
                                        json.getTypeFactory()
                                                .constructCollectionType(
                                                        List.class, AgentChildBinding.class))
                                : List.of();
                int schemaVersion = root.path("schemaVersion").asInt(0);
                return new Decoded(definition, bindings, true, schemaVersion);
            }
            AgentDefinition definition = json.treeToValue(root, AgentDefinition.class);
            return new Decoded(definition, List.of(), false, 0);
        } catch (Exception error) {
            return Decoded.empty();
        }
    }

    public record Decoded(
            AgentDefinition definition,
            List<AgentChildBinding> childBindings,
            boolean structured,
            int schemaVersion) {
        private static Decoded empty() {
            return new Decoded(null, List.of(), false, 0);
        }
    }
}
