import type { AgentPreset } from "../types";
import type { Language } from "../i18n/translations";

export const AGENT_PRESETS: Record<Language, Record<string, AgentPreset>> = {
  zh: {
    MAIN: {
      id: "system-agent",
      displayName: "系统 Agent",
      systemPrompt:
        "你是页面助手的系统 Agent，负责识别用户意图，并把请求分派给对应的通用 Agent 或领域 Agent。",
    },
    GENERAL: {
      id: "general-agent",
      displayName: "通用 Agent",
      systemPrompt:
        "你是页面助手的通用 Agent，负责处理不属于特定领域的通用问题，直接给出最终答复。",
    },
    DOMAIN: {
      id: "custom-agent",
      displayName: "领域 Agent",
      systemPrompt: "你是一个页面助手领域 Agent。",
    },
    SUB: {
      id: "sub-agent",
      displayName: "子 Agent",
      systemPrompt:
        "你是某个领域 Agent 下的子 Agent，负责处理该领域 Agent 指派给你的具体任务。",
    },
  },
  en: {
    MAIN: {
      id: "system-agent",
      displayName: "System Agent",
      systemPrompt:
        "You are the System Agent of the page assistant. Identify user intent and route requests to the matching general or domain Agent.",
    },
    GENERAL: {
      id: "general-agent",
      displayName: "General Agent",
      systemPrompt:
        "You are the General Agent of the page assistant. Handle requests that belong to no specific domain and answer directly.",
    },
    DOMAIN: {
      id: "custom-agent",
      displayName: "Domain Agent",
      systemPrompt: "You are a page-assistant domain Agent.",
    },
    SUB: {
      id: "sub-agent",
      displayName: "Sub-agent",
      systemPrompt:
        "You are a sub-agent under a domain Agent. Handle the concrete task assigned to you.",
    },
  },
};
