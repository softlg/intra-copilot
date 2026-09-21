package com.intra.copilot.interfaces.rest.agent;

import com.intra.copilot.application.agent.BrowserTaskService;
import com.intra.copilot.domain.agent.BrowserTask;
import com.intra.copilot.domain.agent.BrowserTaskEvent;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/browser/tasks")
public class BrowserTaskController {
    private final BrowserTaskService service;

    public BrowserTaskController(BrowserTaskService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BrowserTask create(@RequestBody BrowserTaskService.CreateRequest request) {
        return service.create(request);
    }

    @GetMapping
    public List<BrowserTask> list(@RequestParam(defaultValue = "50") int limit) {
        return service.list(limit);
    }

    @GetMapping("/{id}")
    public BrowserTask get(@PathVariable String id) {
        return service.get(id);
    }

    @GetMapping("/{id}/events")
    public List<BrowserTaskEvent> events(@PathVariable String id) {
        return service.events(id);
    }

    @PostMapping("/{id}/cancel")
    public BrowserTask cancel(@PathVariable String id) {
        return service.cancel(id);
    }
}
