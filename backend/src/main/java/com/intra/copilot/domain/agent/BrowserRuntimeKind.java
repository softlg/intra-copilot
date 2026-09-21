package com.intra.copilot.domain.agent;

import java.util.Locale;

/** Execution environment for a browser task. */
public enum BrowserRuntimeKind {
    EXTENSION,
    EMBEDDED,
    SERVER,
    TOOL_RESULT;

    public static BrowserRuntimeKind from(String value) {
        if (value == null || value.isBlank()) return TOOL_RESULT;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return TOOL_RESULT;
        }
    }
}
