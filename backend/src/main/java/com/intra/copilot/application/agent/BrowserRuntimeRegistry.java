package com.intra.copilot.application.agent;

import com.intra.copilot.domain.agent.BrowserInteractionMode;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.domain.agent.BrowserTask;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Runtime plug-in registry used by browser task execution and tests. */
@Component
public class BrowserRuntimeRegistry {
    private final Map<BrowserRuntimeKind, BrowserRuntime> runtimes = new ConcurrentHashMap<>();

    public BrowserRuntimeRegistry(List<BrowserRuntime> values) {
        if (values == null) return;
        values.forEach(runtime -> runtimes.put(runtime.kind(), runtime));
    }

    public void register(BrowserRuntime runtime) {
        if (runtime != null) runtimes.put(runtime.kind(), runtime);
    }

    public Optional<BrowserRuntime> find(
            BrowserRuntimeKind kind, BrowserInteractionMode interactionMode) {
        BrowserRuntime runtime = runtimes.get(kind);
        if (runtime == null
                || !runtime.available()
                || !runtime.supports(
                        interactionMode == null ? BrowserInteractionMode.FAST : interactionMode)) {
            return Optional.empty();
        }
        return Optional.of(runtime);
    }

    public Optional<BrowserRuntime> findForTask(
            BrowserTask task, BrowserInteractionMode interactionMode) {
        if (task == null) return Optional.empty();
        BrowserRuntime runtime = runtimes.get(task.runtimeKind());
        if (runtime == null
                || !runtime.availableFor(task)
                || !runtime.supports(
                        interactionMode == null ? BrowserInteractionMode.FAST : interactionMode)) {
            return Optional.empty();
        }
        return Optional.of(runtime);
    }

    public Optional<BrowserRuntime> defaultRuntime(
            BrowserInteractionMode interactionMode, BrowserRuntimeKind preferred) {
        Optional<BrowserRuntime> preferredRuntime = find(preferred, interactionMode);
        if (preferredRuntime.isPresent()) return preferredRuntime;
        return runtimes.values()
                .stream()
                .filter(BrowserRuntime::available)
                .filter(runtime -> runtime.supports(interactionMode))
                .sorted(Comparator.comparing(runtime -> runtime.kind().name()))
                .findFirst();
    }

    public Optional<BrowserRuntime> defaultRuntimeForTask(
            BrowserTask task,
            BrowserInteractionMode interactionMode,
            BrowserRuntimeKind preferred) {
        Optional<BrowserRuntime> preferredRuntime =
                findForTask(taskWithRuntime(task, preferred), interactionMode);
        if (preferredRuntime.isPresent()) return preferredRuntime;
        return runtimes.values()
                .stream()
                .filter(runtime -> runtime.availableFor(task))
                .filter(runtime -> runtime.supports(interactionMode))
                .sorted(Comparator.comparing(runtime -> runtime.kind().name()))
                .findFirst();
    }

    private BrowserTask taskWithRuntime(BrowserTask task, BrowserRuntimeKind kind) {
        if (task == null || task.runtimeKind() == kind) return task;
        BrowserTask copy = new BrowserTask();
        copy.setTaskId(task.getTaskId());
        copy.setOwnerUserId(task.getOwnerUserId());
        copy.setRuntimeKind(kind.name());
        return copy;
    }

    public List<BrowserRuntimeKind> availableKinds() {
        return runtimes.values()
                .stream()
                .filter(BrowserRuntime::available)
                .map(BrowserRuntime::kind)
                .sorted(Comparator.comparing(Enum::name))
                .toList();
    }
}
