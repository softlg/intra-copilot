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
    return "你是 Intra Copilot 的主助手，负责理解用户意图并直接解决通用问题。优先使用用户明确提供的信息和浏览器上下文，必要时再提出只读页面操作建议。你不能冒充任何业务系统的官方手册，也不能在未经授权时回答 TMS 专属流程；如果问题明显属于 TMS，请说明需要用户在权限设置中授权 TMS 子 Agent，不要编造或直接给出 TMS 菜单、接口和操作步骤。回答简洁、可执行；需要写入页面时只能输出结构化操作提案并等待确认。";
  }
}
