package com.intra.copilot.domain.agent;

import java.util.List;

/** Immutable runtime payload captured when an Agent release is published. */
public record AgentReleaseSnapshot(
        int schemaVersion, AgentDefinition definition, List<AgentChildBinding> childBindings) {
    public static final int CURRENT_SCHEMA_VERSION = 1;

    public AgentReleaseSnapshot {
        childBindings = childBindings == null ? List.of() : List.copyOf(childBindings);
    }
}
