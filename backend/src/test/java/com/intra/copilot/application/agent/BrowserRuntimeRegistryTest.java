package com.intra.copilot.application.agent;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.intra.copilot.domain.agent.BrowserActionValidator;
import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import java.util.List;
import org.junit.jupiter.api.Test;

class BrowserRuntimeRegistryTest {

    @Test
    void selectsPreferredRuntimeWhenAvailable() {
        BrowserRuntime extension = runtime(BrowserRuntimeKind.EXTENSION, true);
        BrowserRuntime server = runtime(BrowserRuntimeKind.SERVER, true);
        BrowserRuntimeRegistry registry = new BrowserRuntimeRegistry(List.of(extension, server));

        assertEquals(
                BrowserRuntimeKind.SERVER,
                registry.find(BrowserRuntimeKind.SERVER, BrowserInteractionMode.VISIBLE_VIRTUAL)
                        .orElseThrow()
                        .kind());
        assertTrue(
                registry.availableKinds()
                        .containsAll(
                                List.of(BrowserRuntimeKind.EXTENSION, BrowserRuntimeKind.SERVER)));
    }

    private BrowserRuntime runtime(BrowserRuntimeKind kind, boolean available) {
        return new BrowserRuntime() {
            @Override
            public BrowserRuntimeKind kind() {
                return kind;
            }

            @Override
            public boolean available() {
                return available;
            }

            @Override
            public boolean supports(BrowserInteractionMode interactionMode) {
                return true;
            }

            @Override
            public Observation observe(BrowserTask task) {
                return new Observation("snap", 0, "", "", "", "", List.of());
            }

            @Override
            public ActionResult execute(
                    BrowserTask task, BrowserActionValidator.NormalizedAction action) {
                return ActionResult.completed(observe(task), "{}");
            }
        };
    }
}
