package com.intra.copilot.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intra.copilot.model.McpServer;
import com.intra.copilot.model.ToolDefinition;
import com.intra.copilot.repo.AgentDefinitionRepository;
import com.intra.copilot.repo.McpServerRepository;
import com.intra.copilot.repo.SkillToolBindingRepository;
import com.intra.copilot.repo.ToolDefinitionRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class McpServerServiceTest {

    private static final String DEAD_URL = "http://127.0.0.1:1/rpc";

    private McpServerService buildService(
            McpServerRepository repository,
            ToolDefinitionRepository toolRepository,
            AgentDefinitionRepository agents,
            SkillToolBindingRepository skillToolBindings) {
        return new McpServerService(
                repository,
                toolRepository,
                agents,
                skillToolBindings,
                new ObjectMapper(),
                RestClient.builder(),
                2000,
                true,
                false,
                60000);
    }

    private McpServer sampleServer() {
        McpServer server = new McpServer();
        server.setId("MC1");
        server.setName("demo");
        server.setServerUrl(DEAD_URL);
        server.setTransport("STREAMABLE_HTTP");
        server.setEnabled(true);
        return server;
    }

    /**
     * P0-1: 健康检查失败时不应把镜像 Tool 当作"远端无接口"而清掉。连接被拒会抛出，
     * 应被 catch 捕获为 UNHEALTHY，且 syncTools 不被调用（不删除/不禁用任何 Tool）。
     */
    @Test
    void checkHealthFailureDoesNotDeleteMirroredTools() {
        McpServerRepository repository = mock(McpServerRepository.class);
        ToolDefinitionRepository toolRepository = mock(ToolDefinitionRepository.class);
        AgentDefinitionRepository agents = mock(AgentDefinitionRepository.class);
        SkillToolBindingRepository skillToolBindings = mock(SkillToolBindingRepository.class);

        McpServer server = sampleServer();
        ToolDefinition mirrored = new ToolDefinition();
        mirrored.setId("TL1");
        mirrored.setName("demo_tool");
        mirrored.setType("MCP");
        mirrored.setMcpServerId("MC1");
        mirrored.setEnabled(true);

        when(repository.findById("MC1")).thenReturn(Optional.of(server));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(toolRepository.findAll()).thenReturn(List.of(mirrored));
        when(agents.findAll()).thenReturn(List.of());
        when(skillToolBindings.findByToolId(anyString())).thenReturn(List.of());

        McpServerService service = buildService(repository, toolRepository, agents, skillToolBindings);

        McpServer result = service.checkHealth("MC1");

        assertEquals("UNHEALTHY", result.getStatus());
        verify(toolRepository, never()).deleteById(anyString());
        verify(toolRepository, never()).save(any(ToolDefinition.class));
    }

    /**
     * 保存后立即自动发现：create 内部会触发 checkHealth，因此返回的 server 状态不应再是 UNKNOWN。
     */
    @Test
    void createTriggersAutoDiscovery() {
        McpServerRepository repository = mock(McpServerRepository.class);
        ToolDefinitionRepository toolRepository = mock(ToolDefinitionRepository.class);
        AgentDefinitionRepository agents = mock(AgentDefinitionRepository.class);
        SkillToolBindingRepository skillToolBindings = mock(SkillToolBindingRepository.class);

        McpServer server = sampleServer();
        when(repository.findById("MC1")).thenReturn(Optional.of(server));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(repository.findAll()).thenReturn(List.of());
        when(toolRepository.findAll()).thenReturn(List.of());
        when(agents.findAll()).thenReturn(List.of());
        when(skillToolBindings.findByToolId(anyString())).thenReturn(List.of());

        McpServerService service = buildService(repository, toolRepository, agents, skillToolBindings);

        McpServer created = service.create(server);

        assertNotEquals("UNKNOWN", created.getStatus());
    }

    /** update 修改地址后应正常保存新地址，不抛异常（配置变更检测路径不回归）。 */
    @Test
    void updateWithNewUrlPersistsChange() {
        McpServerRepository repository = mock(McpServerRepository.class);
        ToolDefinitionRepository toolRepository = mock(ToolDefinitionRepository.class);
        AgentDefinitionRepository agents = mock(AgentDefinitionRepository.class);
        SkillToolBindingRepository skillToolBindings = mock(SkillToolBindingRepository.class);

        McpServer server = sampleServer();
        when(repository.findById("MC1")).thenReturn(Optional.of(server));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(repository.findAll()).thenReturn(List.of());
        when(toolRepository.findAll()).thenReturn(List.of());
        when(agents.findAll()).thenReturn(List.of());
        when(skillToolBindings.findByToolId(anyString())).thenReturn(List.of());

        McpServerService service = buildService(repository, toolRepository, agents, skillToolBindings);

        McpServer update = new McpServer();
        update.setName("demo");
        update.setServerUrl("http://127.0.0.1:2/rpc");
        update.setTransport("STREAMABLE_HTTP");
        update.setEnabled(true);

        McpServer updated = service.update("MC1", update);

        assertEquals("http://127.0.0.1:2/rpc", updated.getServerUrl());
    }
}
