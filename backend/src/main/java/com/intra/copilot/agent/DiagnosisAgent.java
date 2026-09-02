package com.intra.copilot.agent;

import org.springframework.stereotype.Component;

@Component
public class DiagnosisAgent implements Agent {
  public String id() {
    return "diagnosis";
  }

  public String displayName() {
    return "问题诊断 Agent";
  }

  public String description() {
    return "分析页面报错、流程异常与接口问题";
  }

  public boolean supportsBrowserActions() {
    return true;
  }

  public String systemPrompt() {
    return "你是问题诊断 Agent。基于用户描述和浏览器上下文，输出：现象、可能原因、验证步骤、修复建议。不要编造看不到的事实；需要页面操作时只能提出结构化操作建议并等待用户确认。";
  }

  public boolean matches(String t) {
    return t.matches("(?s).*(报错|错误|异常|故障|诊断|排查|打不开|失败|bug|error).* ".trim());
  }
}
