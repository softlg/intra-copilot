package com.intra.copilot.service;

import com.intra.copilot.model.ToolDefinition;
import org.springframework.ai.tool.ToolCallback;

/**
 * 把后台配置的 {@link ToolDefinition} 适配成 Spring AI 的原生 {@link ToolCallback}，
 * 使模型可以通过 OpenAI 兼容的 function calling 直接发起结构化 Tool 调用（而非在文本里吐 JSON）。
 *
 * <p>Tool 的实际执行仍委托 {@link ToolExecutor}，以复用其 HTTP / MCP / 浏览器提案三类分支以及
 * 内网访问防护、超时控制等逻辑；这里只负责把 Tool 的「名称 / 描述 / 入参 JSON Schema」暴露给模型，
 * 并把模型下发的参数 JSON 转交执行器。
 */
public class ToolDefinitionToolCallback implements ToolCallback {

    private final ToolDefinition def;
    private final ToolExecutor executor;

    public ToolDefinitionToolCallback(ToolDefinition def, ToolExecutor executor) {
        this.def = def;
        this.executor = executor;
    }

    @Override
    public org.springframework.ai.tool.definition.ToolDefinition getToolDefinition() {
        String schema = def.getParameterSchema();
        if (schema == null || schema.isBlank() || "{}".equals(schema.trim())) {
            schema = "{\"type\":\"object\",\"properties\":{}}";
        }
        return org.springframework.ai.tool.definition.ToolDefinition.builder()
                .name(def.getName())
                .description(def.getDescription() == null ? "" : def.getDescription())
                .inputSchema(schema)
                .build();
    }

    @Override
    public String call(String toolInput) {
        return executor.execute(def, toolInput);
    }
}
