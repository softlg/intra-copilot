package com.intra.copilot.shared.identity;

import java.util.Locale;

/** Ordered management-console roles. Higher ranks inherit lower-role access. */
public enum AdminRole {
    VIEWER(10),
    EDITOR(50),
    ADMIN(80),
    OWNER(100);

    private final int rank;

    AdminRole(int rank) {
        this.rank = rank;
    }

    public boolean atLeast(AdminRole required) {
        return rank >= required.rank;
    }

    public static AdminRole parse(String value) {
        if (value == null || value.isBlank()) return VIEWER;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("未知管理员角色：" + value);
        }
    }
}
