package com.intra.copilot.web;

import com.intra.copilot.model.McpServer;
import com.intra.copilot.service.McpServerService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/mcp-servers")
public class McpServerAdminController {
    private final McpServerService service;

    public McpServerAdminController(McpServerService service) { this.service = service; }

    @GetMapping
    public List<McpServer> list() { return service.list(); }

    @GetMapping("/{id}")
    public McpServer get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public McpServer create(@RequestBody McpServer server) { return service.create(server); }

    @PutMapping("/{id}")
    public McpServer update(@PathVariable String id, @RequestBody McpServer server) { return service.update(id, server); }

    @PostMapping("/{id}/health")
    public McpServer health(@PathVariable String id) { return service.checkHealth(id); }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) { service.delete(id); }
}
