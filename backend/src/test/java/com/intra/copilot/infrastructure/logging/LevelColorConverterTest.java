package com.intra.copilot.infrastructure.logging;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ansi.AnsiOutput;

class LevelColorConverterTest {

    @Test
    void assignsDistinctColorsToLogLevels() {
        AnsiOutput.Enabled previous = AnsiOutput.getEnabled();
        AnsiOutput.setEnabled(AnsiOutput.Enabled.ALWAYS);
        try {
            LevelColorConverter converter = new LevelColorConverter();
            List<String> rendered =
                    List.of(Level.TRACE, Level.DEBUG, Level.INFO, Level.WARN, Level.ERROR)
                            .stream()
                            .map(level -> converter.transform(event(level), level.toString()))
                            .toList();

            assertEquals(5, rendered.stream().distinct().count());
        } finally {
            AnsiOutput.setEnabled(previous);
        }
    }

    @Test
    void leavesOutputUntouchedWhenAnsiIsDisabled() {
        AnsiOutput.Enabled previous = AnsiOutput.getEnabled();
        AnsiOutput.setEnabled(AnsiOutput.Enabled.NEVER);
        try {
            String rendered = new LevelColorConverter().transform(event(Level.INFO), "INFO");

            assertEquals("INFO", rendered);
            assertNotEquals("INFO\u001B[0m", rendered);
        } finally {
            AnsiOutput.setEnabled(previous);
        }
    }

    private ILoggingEvent event(Level level) {
        ILoggingEvent event = mock(ILoggingEvent.class);
        when(event.getLevel()).thenReturn(level);
        return event;
    }
}
