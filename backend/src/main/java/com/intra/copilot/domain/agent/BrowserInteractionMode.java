package com.intra.copilot.domain.agent;

import java.util.Locale;

/** Controls how visible browser execution should be for the user. */
public enum BrowserInteractionMode {
    FAST,
    VISIBLE_VIRTUAL,
    BROWSER_TRUSTED,
    SYSTEM_TRUSTED;

    public static BrowserInteractionMode from(String value) {
        if (value == null || value.isBlank()) return FAST;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return FAST;
        }
    }
}
