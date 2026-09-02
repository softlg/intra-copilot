package com.intra.copilot.agent;

import org.springframework.stereotype.Component;

@Component
public class TmsManualAgent implements Agent {
  public String id() {
    return "tms-manual";
  }

  public String displayName() {
    return "TMS 操作手册 Agent";
  }

  public String description() {
    return "回答 TMS 功能、菜单和流程操作问题";
  }

  public boolean supportsBrowserActions() {
    return true;
  }

  public String systemPrompt() {
    return "你是 TMS 操作手册 Agent。用清晰的编号步骤回答 TMS 菜单、业务流程和字段操作问题。当前没有外部知识库，不确定时请明确说明并请求用户提供页面信息，绝不臆造接口或菜单。需要操作页面时只能提出结构化操作建议并等待确认。";
  }

  public boolean matches(String t) {
    return t.matches("(?s).*(TMS|运输|运单|订单|发货|收货|菜单|怎么操作|操作手册).* ".trim());
  }
}
