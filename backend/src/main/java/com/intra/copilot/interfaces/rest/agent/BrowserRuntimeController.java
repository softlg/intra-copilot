package com.intra.copilot.interfaces.rest.agent;

import com.intra.copilot.application.agent.BrowserRuntimeLeaseService;
import com.intra.copilot.application.agent.BrowserRuntimePresenceService;
import com.intra.copilot.application.agent.BrowserRuntimeRegistry;
import com.intra.copilot.shared.identity.RequestContext;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/browser/runtimes")
public class BrowserRuntimeController {
    private final BrowserRuntimeRegistry runtimes;
    private final BrowserRuntimeLeaseService leases;

    public BrowserRuntimeController(
            BrowserRuntimeRegistry runtimes, BrowserRuntimeLeaseService leases) {
        this.runtimes = runtimes;
        this.leases = leases;
    }

    @GetMapping
    public Map<String, Object> runtimes() {
        List<String> availableRuntimes =
                runtimes.availableKinds().stream().map(Enum::name).toList();
        return Map.of(
                "supported",
                List.of("EXTENSION", "EMBEDDED", "SERVER"),
                "interactionModes",
                List.of("FAST", "VISIBLE_VIRTUAL", "BROWSER_TRUSTED", "SYSTEM_TRUSTED"),
                "available",
                availableRuntimes);
    }

    @PostMapping("/presence")
    public BrowserRuntimePresenceService.Report presence(
            @RequestBody BrowserRuntimePresenceService.Report request) {
        leases.reportPresence(RequestContext.current().userId(), request);
        return request;
    }

    @PostMapping("/leases")
    public ResponseEntity<BrowserRuntimeLeaseService.LeaseView> claim(
            @RequestBody BrowserRuntimeLeaseService.ClaimRequest request) {
        BrowserRuntimeLeaseService.LeaseView value =
                leases.claim(RequestContext.current().userId(), request);
        return value == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(value);
    }

    @PostMapping("/commands/{id}/result")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void result(
            @PathVariable String id,
            @RequestBody BrowserRuntimeLeaseService.CommandResult request) {
        leases.report(RequestContext.current().userId(), id, request);
    }

    @PostMapping("/leases/release")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void release(@RequestBody BrowserRuntimeLeaseService.ReleaseRequest request) {
        leases.release(RequestContext.current().userId(), request);
    }
}
