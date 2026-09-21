package com.intra.copilot.domain.agent;

import java.util.Locale;

/** Persisted lifecycle for one browser task. */
public enum BrowserTaskStatus {
    CREATED,
    QUEUED,
    RUNNING,
    WAITING_USER,
    WAITING_PAGE,
    VERIFYING,
    COMPLETED,
    FAILED,
    CANCELED,
    EXPIRED;

    public static BrowserTaskStatus from(String value) {
        if (value == null || value.isBlank()) return CREATED;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            return CREATED;
        }
    }

    public boolean terminal() {
        return this == COMPLETED || this == FAILED || this == CANCELED || this == EXPIRED;
    }
}
