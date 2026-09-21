package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserActionValidator;
import java.util.List;
import java.util.Map;

/** Common execution contract for extension, embedded and server browser runtimes. */
public interface BrowserRuntime {
    BrowserRuntimeKind kind();

    boolean available();

    default boolean availableFor(BrowserTask task) {
        return available();
    }

    boolean supports(BrowserInteractionMode interactionMode);

    Observation observe(BrowserTask task);

    ActionResult execute(BrowserTask task, BrowserActionValidator.NormalizedAction action);

    default void close(BrowserTask task) {}

    record Observation(
            String snapshotId,
            int frameId,
            String url,
            String title,
            String visibleText,
            String domSummary,
            List<Map<String, Object>> frames) {}

    record ActionResult(
            boolean ok,
            boolean verified,
            String status,
            String result,
            Observation observation,
            String error) {
        public static ActionResult completed(Observation observation, String result) {
            return new ActionResult(true, true, "EXECUTED", result, observation, null);
        }

        public static ActionResult failed(String error, Observation observation) {
            return new ActionResult(false, false, "FAILED", "{}", observation, error);
        }
    }
}
