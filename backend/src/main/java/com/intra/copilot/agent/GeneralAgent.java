package com.intra.copilot.agent;

import org.springframework.stereotype.Component;

/** The user-facing assistant. Domain agents are internal collaborators selected by the router. */
@Component
public class GeneralAgent implements Agent {
  public String id() {
    return "assistant";
  }

  public String displayName() {
    return "Intra Copilot";
  }

  public String description() {
    return "理解用户意图并直接处理通用问题";
  }

  public boolean supportsBrowserActions() {
    return true;
  }

  public String systemPrompt() {
    return "你是 Intra Copilot 的主助手，负责处理由 Intra route Copilot 分发的用户请求。优先使用用户明确提供的信息和浏览器上下文，回答简洁、可执行；需要写入页面时只能输出结构化操作提案并等待用户确认。不要编造看不到的事实、接口或菜单。";
  }
}
