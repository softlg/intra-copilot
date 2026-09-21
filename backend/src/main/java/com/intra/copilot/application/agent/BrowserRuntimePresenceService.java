package com.intra.copilot.application.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.domain.agent.BrowserRuntimeInstance;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import com.intra.copilot.infrastructure.persistence.agent.BrowserRuntimeInstanceRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Tracks which browser runtime instances are currently reachable. */
@Service
public class BrowserRuntimePresenceService {
    private final BrowserRuntimeInstanceRepository instances;
    private final ObjectMapper json;
    private final Duration ttl;

    public BrowserRuntimePresenceService(
            BrowserRuntimeInstanceRepository instances,
            ObjectMapper json,
            @Value("${browser.runtime.presence-ttl-seconds:75}") long ttlSeconds) {
        this.instances = instances;
        this.json = json;
        this.ttl = Duration.ofSeconds(Math.max(15L, Math.min(600L, ttlSeconds)));
    }

    public BrowserRuntimeInstance report(
            String ownerUserId,
            String instanceId,
            BrowserRuntimeKind runtimeKind,
            int protocolVersion,
            String runtimeVersion,
            List<String> supportedActions,
            List<String> interactionModes,
            String currentUrl) {
        if (ownerUserId == null || ownerUserId.isBlank()) {
            throw new NoSuchElementException("Runtime 用户不存在");
        }
        if (instanceId == null || instanceId.isBlank() || instanceId.length() > 160) {
            throw new IllegalArgumentException("runtimeInstanceId 不能为空且不能超过 160 个字符");
        }
        BrowserRuntimeInstance value =
                instances
                        .findById(instanceId)
                        .orElseGet(
                                () -> {
                                    BrowserRuntimeInstance created = new BrowserRuntimeInstance();
                                    created.setInstanceId(instanceId);
                                    created.setOwnerUserId(ownerUserId);
                                    created.setRuntimeKind(runtimeKind.name());
                                    return created;
                                });
        if (!ownerUserId.equals(value.getOwnerUserId())) {
            throw new IllegalArgumentException("runtimeInstanceId 已被其他用户占用");
        }
        value.setRuntimeKind(runtimeKind.name());
        value.setProtocolVersion(protocolVersion);
        value.setRuntimeVersion(trim(runtimeVersion));
        value.setSupportedActions(writeList(supportedActions));
        value.setInteractionModes(writeList(interactionModes));
        value.setCurrentUrl(trim(currentUrl));
        value.setLastSeenAt(Instant.now());
        return instances.save(value);
    }

    public boolean online(BrowserRuntimeKind kind) {
        return kind != null
                && instances.online(
                        kind.name(),
                        BrowserRuntimeLeaseService.PROTOCOL_VERSION,
                        Instant.now().minus(ttl));
    }

    public boolean onlineForOwner(BrowserRuntimeKind kind, String ownerUserId) {
        if (kind == null || ownerUserId == null || ownerUserId.isBlank()) return false;
        return onlineInstances(kind)
                .stream()
                .anyMatch(instance -> ownerUserId.equals(instance.getOwnerUserId()));
    }

    public List<BrowserRuntimeInstance> onlineInstances(BrowserRuntimeKind kind) {
        if (kind == null) return List.of();
        return instances.findOnline(
                kind.name(),
                BrowserRuntimeLeaseService.PROTOCOL_VERSION,
                Instant.now().minus(ttl),
                100);
    }

    public boolean supports(BrowserRuntimeKind kind, String interactionMode) {
        if (kind == null || interactionMode == null || interactionMode.isBlank()) {
            return false;
        }
        String expected = interactionMode.toUpperCase(java.util.Locale.ROOT);
        return onlineInstances(kind)
                .stream()
                .map(BrowserRuntimeInstance::getInteractionModes)
                .map(this::readList)
                .anyMatch(values -> values.contains(expected));
    }

    public int protocolVersion(String instanceId) {
        return instances
                .findById(instanceId)
                .map(BrowserRuntimeInstance::getProtocolVersion)
                .orElse(0);
    }

    public record Report(
            String runtimeKind,
            String runtimeInstanceId,
            int protocolVersion,
            String runtimeVersion,
            List<String> supportedActions,
            List<String> interactionModes,
            String currentUrl) {}

    private String writeList(List<String> values) {
        try {
            return json.writeValueAsString(
                    values == null
                            ? List.of()
                            : values.stream()
                                    .filter(value -> value != null && !value.isBlank())
                                    .map(String::trim)
                                    .distinct()
                                    .limit(64)
                                    .toList());
        } catch (Exception error) {
            throw new IllegalArgumentException("Runtime 能力列表无效", error);
        }
    }

    private Set<String> readList(String raw) {
        try {
            List<String> values =
                    json.readValue(
                            raw == null || raw.isBlank() ? "[]" : raw,
                            new com.fasterxml.jackson.core.type.TypeReference<>() {});
            return values.stream()
                    .filter(value -> value != null && !value.isBlank())
                    .map(value -> value.toUpperCase(java.util.Locale.ROOT))
                    .collect(java.util.stream.Collectors.toSet());
        } catch (Exception ignored) {
            return Set.of();
        }
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
