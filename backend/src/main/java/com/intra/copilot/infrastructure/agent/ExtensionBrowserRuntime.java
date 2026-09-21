package com.intra.copilot.infrastructure.agent;

import com.intra.copilot.application.agent.BrowserRuntimePresenceService;
import com.intra.copilot.application.agent.BrowserTaskCommandService;
import com.intra.copilot.application.agent.RemoteBrowserRuntime;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import org.springframework.stereotype.Component;

/** Runtime backed by the authenticated MV3 extension command queue. */
@Component
public class ExtensionBrowserRuntime extends RemoteBrowserRuntime {
    public ExtensionBrowserRuntime(
            BrowserTaskCommandService commands, BrowserRuntimePresenceService presence) {
        super(commands, presence);
    }

    @Override
    public BrowserRuntimeKind kind() {
        return BrowserRuntimeKind.EXTENSION;
    }
}
