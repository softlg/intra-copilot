package com.intra.copilot.infrastructure.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.pattern.CompositeConverter;
import org.springframework.boot.ansi.AnsiColor;
import org.springframework.boot.ansi.AnsiElement;
import org.springframework.boot.ansi.AnsiOutput;

/** Gives every console log level a distinct ANSI color. */
public class LevelColorConverter extends CompositeConverter<ILoggingEvent> {
    @Override
    protected String transform(ILoggingEvent event, String value) {
        AnsiElement color = colorFor(event == null ? null : event.getLevel());
        return color == null ? value : AnsiOutput.toString(color, value);
    }

    private AnsiElement colorFor(Level level) {
        if (level == null) return null;
        if (level.isGreaterOrEqual(Level.ERROR)) return AnsiColor.RED;
        if (level.isGreaterOrEqual(Level.WARN)) return AnsiColor.YELLOW;
        if (level.isGreaterOrEqual(Level.INFO)) return AnsiColor.GREEN;
        if (level.isGreaterOrEqual(Level.DEBUG)) return AnsiColor.CYAN;
        return AnsiColor.MAGENTA;
    }
}
