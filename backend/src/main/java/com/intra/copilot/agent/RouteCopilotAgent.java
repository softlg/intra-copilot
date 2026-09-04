package com.intra.copilot.agent;

import org.springframework.stereotype.Component;

/** System agent responsible for intent recognition and dispatching work. */
@Component
public class RouteCopilotAgent implements Agent {
  public String id() {
    return "route-copilot";
  }

  public String displayName() {
    return "Intra route Copilot";
  }

  public String description() {
    return "识别用户意图，并指派后台 Agent 处理";
  }

  public boolean supportsBrowserActions() {
    return false;
  }

  public String systemPrompt() {
    return "你是 Intra route Copilot，负责识别用户意图、结合页面上下文和历史消息选择最合适的后台 Agent。你只负责路由和必要的澄清，不直接冒充业务 Agent 回答。必须使用结构化路由结果，不编造不存在的 Agent。";
  }
}
