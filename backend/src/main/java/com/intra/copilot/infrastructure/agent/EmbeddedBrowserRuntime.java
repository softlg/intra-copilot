package com.intra.copilot.infrastructure.agent;

import com.intra.copilot.application.agent.BrowserRuntimePresenceService;
import com.intra.copilot.application.agent.BrowserTaskCommandService;
import com.intra.copilot.application.agent.RemoteBrowserRuntime;
import com.intra.copilot.domain.agent.BrowserRuntimeKind;
import org.springframework.stereotype.Component;

/** Runtime hosted by a page that embeds the Intra Copilot SDK. */
@Component
public class EmbeddedBrowserRuntime extends RemoteBrowserRuntime {
    public EmbeddedBrowserRuntime(
            BrowserTaskCommandService commands, BrowserRuntimePresenceService presence) {
        super(commands, presence);
    }

    @Override
    public BrowserRuntimeKind kind() {
        return BrowserRuntimeKind.EMBEDDED;
    }
}
