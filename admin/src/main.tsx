import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import Pagination from "./components/Pagination";
import { ToastContainer, toast } from "./components/Toast";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Tooltip } from "./components/Tooltip";
import { TruncatedId } from "./components/TruncatedId";
import { FieldHint } from "./components/FieldHint";
import { Dropdown } from "./components/Dropdown";
import { StatusBadge, type StatusKind } from "./components/StatusBadge";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8080/api/v1";
type Language = "zh" | "en";
type Theme = "dark" | "light";

const translations = {
  zh: {
    title: "页面助手",
    subtitle: "管理控制台",
    agents: "Agent",
    knowledge: "知识库",
    mcpServers: "MCP 服务",
    mcpServersTitle: "MCP 服务管理",
    mcpServersSubtitle: "注册 MCP Server，查看健康状态、接口数量和能力详情。",
    newMcpServer: "+ 新建 MCP 服务",
    mcpServerName: "服务名称",
    mcpServerUrlLabel: "服务地址",
    mcpTransportLabel: "传输方式",
    mcpAuthEnvLabel: "认证环境变量（可选）",
    mcpAuthEnvHint: "仅保存环境变量名称，不保存密钥本身。",
    mcpDescriptionPlaceholder: "说明这个 MCP 服务提供的能力",
    mcpHealth: "检查健康",
    mcpInterfaces: "个接口",
    mcpDetails: "接口详情",
    mcpStatusUnknown: "未检查",
    mcpStatusHealthy: "健康",
    mcpStatusDegraded: "部分可用",
    mcpStatusUnhealthy: "不可用",
    mcpLastChecked: "最近检查",
    mcpLatency: "响应耗时",
    mcpCapabilities: "服务能力",
    mcpNoInterfaces: "暂无接口信息，请先执行健康检查。",
    mcpCheckFailed: "健康检查失败，请确认服务地址和权限。",
    mcpSaveFailed: "保存 MCP 服务失败，请稍后重试",
    mcpDeleteConfirm: (name: string) => `确定删除 MCP 服务“${name}”吗？`,
    mcpDeleted: (name: string) => `MCP 服务“${name}”已删除`,
    mcpErrorDetail: "错误详情",
    mcpErrorHint: "完整错误信息，可用于排查问题。点击复制或重新检查。",
    mcpErrorTooltip: "点击查看完整错误信息",
    copied: "已复制到剪贴板",
    copyFailed: "复制失败，请手动选择",
    copy: "复制",
    confirmDeleteTitle: "确认删除",
    cancelLabel: "取消",
    unsavedChangesTitle: "有未保存的修改",
    unsavedChangesDesc:
      "你对该 Agent 的修改尚未保存，确定要离开吗？离开后修改将丢失。",
    unsavedTabChangeDesc:
      "当前 Tab 有未保存的修改，确定要切换吗？切换后修改将丢失。",
    discardChanges: "放弃修改",
    stayHere: "留在当前页",
    deleteAgentEnabled: "该 Agent 处于启用状态，请先停用后再删除",
    agentDeleted: (name: string) => `Agent “${name}”已删除`,
    toolDeleted: (name: string) => `工具 “${name}”已删除`,
    skillDeleted: (name: string) => `Skill “${name}”已删除`,
    hookDeleted: (name: string) => `钩子 “${name}”已删除`,
    documentDeleted: (name: string) => `文档 “${name}”已删除`,
    toolsMenu: "工具",
    skillsMenu: "Skill",
    skillsTitle: "Skill 管理",
    hooksMenu: "钩子",
    hooksTitle: "钩子管理",
    hooksSubtitle: "在 Agent 执行前运行权限、页面上下文和内容校验规则。",
    newHook: "+ 新建钩子",
    editHook: "编辑钩子",
    hookName: "名称",
    hookNameRequired: "请输入钩子名称",
    hookDescription: "描述（可选）",
    hookDescriptionPlaceholder: "说明这个钩子保护什么操作",
    hookPhase: "执行阶段",
    preAgent: "Agent 执行前",
    hookRuleType: "校验规则",
    requirePermission: "需要页面权限",
    requirePageContext: "需要页面上下文",
    keywordBlock: "关键词拦截",
    maxMessageLength: "消息长度限制",
    hookRuleConfig: "规则配置（JSON）",
    hookRuleConfigPlaceholder: '{"permission":"readPage"}',
    hookFailureMessage: "拒绝提示",
    hookFailureMessagePlaceholder: "未通过校验时返回给用户的提示",
    hookPriority: "优先级",
    hookDeleteConfirm: (name: string) => `确定删除钩子“${name}”吗？`,
    hookSaveFailed: "保存钩子失败，请检查配置后重试",
    hookDeleteFailed: "删除钩子失败，请稍后重试",
    noHooks: "暂无钩子，请先创建校验规则。",
    router: "路由测试",
    agentRatings: "评分/巡检",
    ratingsSubtitle: "记录用户赞/踩反馈，分析低评分原因并生成 Agent 改进建议。",
    conversationLogs: "对话日志",
    conversationLogsSubtitle: "按会话查看用户消息、路由和 Agent 执行过程。",
    agentConfig: "Agent 配置",
    routerTest: "系统 Agent 路由测试",
    localMode: "本机模式",
    newAgent: "+ 新建 Agent",
    newBase: "+ 新建知识库",
    enabled: "已启用",
    disabled: "已停用",
    noDescription: "暂无描述",
    stop: "停用",
    enable: "启用",
    deleteAgent: "删除",
    deleteAgentConfirm: (name: string) =>
      `确定删除 Agent“${name}”吗？此操作不可撤销。`,
    deleteAgentDisabledHint: "请先停用 Agent 后再删除",
    deleteAgentFailed: "删除 Agent 失败，请稍后重试",
    systemAgent: "系统 Agent",
    customAgent: "自定义 Agent",
    systemAgentHint: "系统 Agent 由页面助手内置提供，不允许删除",
    customAgentHint: "自定义 Agent 可按需停用后删除",
    systemAgentPageHint:
      "请求入口：识别用户意图，分派给通用或领域 Agent，全局唯一。",
    generalAgentPage: "通用 Agent",
    generalAgentPageHint:
      "不归属特定领域时的兜底处理节点，用户可直接选择，不再向下分派。",
    domainAgentPage: "领域 Agent",
    domainAgentPageHint:
      "承接系统 Agent 分派，可自行处理，也可继续分派给已绑定的子 Agent。",
    subAgentPage: "子 Agent",
    subAgentPageHint: "由领域 Agent 绑定并分派的叶子节点，用户不可直接选择。",
    supportedDocs: "支持 Markdown、TXT、PDF 文档",
    upload: "上传文档",
    processing: "解析中…",
    uploadHint: "Markdown、TXT、PDF，最大 10 MB",
    parsed: "已解析",
    pending: "等待处理",
    parseFailed: "解析失败",
    reindex: "重新解析",
    delete: "删除",
    deleteConfirm: (name: string) => `确定删除文档“${name}”吗？`,
    routerPlaceholder: "输入一条消息测试路由",
    routerContextPlaceholder: "页面上下文（可选）",
    testRoute: "测试路由",
    smartAnalyze: "智能分析",
    analyzing: "分析中…",
    routeChain: "完整调用链路",
    routeChainEmpty: "先运行一次路由测试查看调用链路。",
    routeAnalysis: "智能分析结果",
    routeAnalysisFailed: "智能分析失败，请稍后重试",
    routeInput: "接收用户请求",
    routeIntent: "系统 Agent 意图识别",
    routeDispatch: "路由分发",
    routeHooks: "Agent 执行前钩子校验",
    hookPassed: "通过",
    hookRejected: "拦截",
    newAgentTitle: "新建 Agent",
    newAgentSubtitle: "先填写基础信息，创建后可在设置中配置能力和关联资源。",
    agentId: "Agent ID",
    agentIdHint: "使用 2-128 位小写字母、数字和连字符。",
    agentIdPlaceholder: "例如：release-helper",
    displayName: "显示名称",
    displayNamePlaceholder: "例如：发布助手",
    descriptionOptional: "描述（可选）",
    agentDescriptionPlaceholder: "简要说明这个 Agent 负责处理什么问题",
    systemPrompt: "系统提示词",
    systemPromptPlaceholder: "定义 Agent 的角色、边界和回答方式",
    browserActions: "允许使用浏览器操作提案（执行前仍需用户确认）",
    cancel: "取消",
    createAgent: "确认创建 Agent",
    editAgentTitle: "Agent 设置",
    editAgentSubtitle: "调整 Agent 的能力、提示词和关联资源，保存后立即生效。",
    saveAgent: "确认保存",
    saving: "保存中…",
    model: "模型（可选）",
    modelPlaceholder: "留空使用系统默认模型",
    temperature: "温度（可选）",
    priority: "调度优先级",
    knowledgeBases: "关联知识库 ID（可选）",
    tools: "工具绑定",
    skills: "Skill 绑定",
    noTools: "暂无可用工具，请先在工具管理中启用工具。",
    noSkills: "暂无可用 Skill，请先在 Skill 管理中启用 Skill。",
    toolType: "类型",
    browserProposal: "浏览器动作",
    idsHint: "多个 ID 使用英文逗号分隔",
    creating: "创建中…",
    newBaseTitle: "新建知识库",
    newBaseSubtitle: "创建后即可上传文档并用于页面助手检索。",
    baseName: "名称",
    baseNamePlaceholder: "例如：产品操作手册",
    baseDescription: "描述",
    baseDescriptionPlaceholder: "简要说明这个知识库的内容",
    doubleClickToEdit: "双击名称或描述进行编辑",
    createBase: "创建知识库",
    baseNameRequired: "请输入知识库名称",
    agentIdInvalid: "Agent ID 只能使用 2-128 位小写字母、数字和连字符",
    agentNameRequired: "Agent 名称不能为空",
    promptRequired: "系统提示词不能为空",
    parentAgentRequired: "子 Agent 必须选择一个启用的领域 Agent 作为父级",
    createAgentFailed: "创建 Agent 失败，请稍后重试",
    createBaseFailed: "创建知识库失败，请稍后重试",
    uploadFailed: "上传文档失败，请稍后重试",
    reindexFailed: "重新解析文档失败，请稍后重试",
    deleteFailed: "删除文档失败，请稍后重试",
    settings: "设置",
    language: "语言",
    chinese: "中文",
    english: "English",
    appearance: "背景颜色",
    dark: "深色",
    light: "浅色",
    close: "关闭",
    error: "提示",
    enter: "进入维护",
    back: "返回知识库",
    maintenance: "知识维护",
    qaSettings: "问答场景设置",
    documentCount: (count: number) => `${count} 个文档`,
    noDocuments: "暂无文档，请上传资料开始维护。",
    chooseDocuments: "选择文档",
    viewDocument: "查看详情",
    documentDetails: "文档详情",
    documentSize: "文件大小",
    documentHash: "文件指纹",
    documentChunks: "内容分块",
    loading: "加载中…",
    retrievalTest: "检索测试",
    retrievalPlaceholder: "输入问题，测试知识库召回结果",
    runRetrieval: "开始检索",
    retrievalEmpty: "暂无命中内容",
    retrievalFailed: "检索失败，请检查 Embedding 配置",
    qaPrompt: "问答场景提示词",
    qaPromptPlaceholder: "描述回答范围、语气和引用要求",
    topK: "检索条数",
    topKHint: "每次问答最多注入的相关片段数量",
    saveSettings: "保存设置",
    save: "保存",
    saved: "已保存",
    collapseSidebar: "收缩菜单栏",
    expandSidebar: "展开菜单栏",
    testAgent: "测试",
    testAgentTitle: "测试 Agent",
    testAgentSubtitle: "直接模拟一轮对话，验证当前提示词和能力配置是否生效。",
    testMessage: "测试消息",
    testMessagePlaceholder: "输入要发送给该 Agent 的问题",
    testPageContext: "页面上下文（可选）",
    testPageContextPlaceholder: "粘贴页面信息，验证 Agent 是否能正确使用上下文",
    runTest: "运行测试",
    testing: "测试中…",
    testResponse: "Agent 回复",
    testFailed: "Agent 测试失败，请稍后重试",
    agentSettingsPage: "Agent 配置",
    backToAgents: "返回 Agent 列表",
    basicInfo: "基本信息",
    intentRouting: "意图路由",
    agentRole: "Agent 类型",
    roleMain: "系统 Agent",
    roleGeneral: "通用 Agent",
    roleDomain: "领域 Agent",
    roleSub: "子 Agent",
    parentAgent: "父领域 Agent",
    handlingMode: "处理策略",
    directMode: "直接处理",
    delegateMode: "指派子 Agent",
    autoMode: "自动决策",
    returnMode: "返回策略",
    childDirectMode: "直接返回子 Agent 结果",
    domainSummaryMode: "由领域 Agent 总结",
    childBinding: "子 Agent 绑定",
    noChildAgents: "暂无可用子 Agent",
    childRoutingRule: "意图关键词",
    childRoutingRuleHint:
      "命中这些关键词时优先指派给它，多个关键词用逗号分隔；留空则交给自动决策判断",
    childRoutingRulePlaceholder: "例如：舱单, 提单, 核对",
    versions: "版本发布",
    draft: "草稿",
    published: "已发布",
    publish: "发布配置",
    rollback: "回滚",
    publishedVersion: "当前发布版本",
    intentRoutingHint:
      "配置系统 Agent 如何识别意图、选择子 Agent，以及处理低置信度请求。",
    routingRules: "指派规则",
    routingRulesPlaceholder:
      "例如：\n- 页面报错、接口异常 → 优先指派给故障排查子 Agent\n- 产品流程咨询 → 指派给对应业务子 Agent\n- 无法判断时 → 转给 Intra Copilot",
    knowledgeBinding: "知识库绑定",
    noKnowledgeBases: "暂无可用知识库，请先创建知识库。",
    search: "搜索",
    searchPlaceholder: "搜索名称、ID或描述",
    statusFilter: "状态筛选",
    allStatuses: "全部状态",
    noSearchResults: "没有匹配的结果。",
    noAgentOfType: "该类型下暂无 Agent，点击上方按钮新建。",
    viewDetails: "查看详情",
    resourceDetails: "资源详情",
    capabilityBinding: "工具和 Skill",
    toolsTitle: "工具管理",
    toolsSubtitle: "注册可供 Agent 调用的后端 API 工具。",
    skillsSubtitle: "注册可供 Agent 使用的提示词技能。",
    newTool: "+ 新建工具",
    newSkill: "+ 新建 Skill",
    tool: "工具",
    skill: "Skill",
    toolName: "名称",
    toolTypeLabel: "类型",
    endpoint: "Endpoint（HTTP / HTTPS）",
    method: "HTTP 方法",
    toolDescriptionPlaceholder: "说明这个工具可以完成什么操作",
    endpointPlaceholder:
      "http://127.0.0.1:8080/api 或 https://api.example.com/resource",
    endpointHint:
      "支持 HTTP/HTTPS 及本机、内网服务；生产环境建议关闭非安全访问。",
    mcpServerUrl: "MCP 服务器地址（HTTP / HTTPS）",
    mcpServerUrlPlaceholder:
      "http://127.0.0.1:3000/mcp 或 https://mcp.example.com/mcp",
    mcpTransport: "MCP 传输方式",
    mcpSse: "SSE",
    mcpStreamableHttp: "Streamable HTTP",
    mcpAuthEnv: "认证环境变量（可选）",
    mcpAuthEnvPlaceholder: "例如：MCP_API_TOKEN",
    mcpServerRequired: "MCP 工具必须填写服务器地址",
    skillPrompt: "Skill 提示词",
    skillPromptPlaceholder: "定义 Skill 的行为和使用边界",
    version: "版本",
    noResources: "暂无资源，请先创建工具或 Skill。",
    edit: "编辑",
    deleteResource: "删除",
    deleteResourceConfirm: (name: string) =>
      `确定删除“${name}”吗？此操作不可撤销。`,
    deleteDisabledEnabled: "启用状态的数据不允许删除，请先停用",
    resourceNameRequired: "请输入名称",
    nameExists: "名称已存在，请使用其他名称",
    endpointRequired: "HTTP 工具必须填写 Endpoint",
    skillPromptRequired: "Skill 提示词不能为空",
    resourceSaveFailed: "保存资源失败，请稍后重试",
    resourceDeleteFailed: "删除资源失败，请稍后重试",
    saveResource: "保存",
    createResource: "创建",
    ratingUp: "赞",
    ratingDown: "踩",
    noFeedback: "暂无评分反馈。用户在插件中点击赞/踩后会显示在这里。",
    totalFeedback: "总反馈",
    satisfactionRate: "满意度",
    downReasons: "踩反馈原因",
    improvementSuggestions: "改进指导建议",
    feedbackContext: "反馈上下文",
    userQuestion: "用户问题",
    assistantAnswer: "Agent 回复",
    noReason: "未填写原因",
    missingReasonCount: (n: number) =>
      `${n} 条差评缺少原因，建议联系作者补充说明`,
    noConversationLogs:
      "暂无对话日志。用户从浏览器插件发起对话后会显示在这里。",
    userMessage: "用户",
    assistantMessage: "助手",
    invocationDetails: "Agent 执行记录",
    actionDetails: "浏览器动作提案",
    route: "路由",
    duration: "耗时",
    confidence: "置信度",
    routeSource: "路由来源",
    intentResult: "意图识别结果",
    contextTransfer: "传递给子 Agent 的上下文",
    responseTransfer: "子 Agent 返回处理",
    routeTrail: "路由分发轨迹",
    clientIp: "用户 IP",
    actionPending: "待处理",
    actionCompleted: "已完成",
    actionFailed: "失败",
    conversationSessionId: "会话 ID",
    conversationSessionIdPlaceholder: "输入会话 ID 查询",
    conversationTitle: "标题",
    updatedAt: "更新时间",
    messageCount: "消息数",
    detail: "详情",
    query: "查询",
    reset: "重置",
    perPage: "每页",
    prevPage: "上一页",
    nextPage: "下一页",
    paginationTotal: (total: number) => `共 ${total} 条`,
    paginationPosition: (page: number, totalPages: number) =>
      `第 ${page} / ${totalPages} 页`,
    conversationDetailTitle: "会话详情",
  },
  en: {
    title: "Page Assistant",
    subtitle: "Admin Console",
    agents: "Agents",
    knowledge: "Knowledge bases",
    mcpServers: "MCP services",
    mcpServersTitle: "MCP service management",
    mcpServersSubtitle:
      "Register MCP Servers and inspect health, interface count, and capabilities.",
    newMcpServer: "+ New MCP service",
    mcpServerName: "Service name",
    mcpServerUrlLabel: "Server URL",
    mcpTransportLabel: "Transport",
    mcpAuthEnvLabel: "Auth environment variable (optional)",
    mcpAuthEnvHint:
      "Only the environment variable name is stored; secrets stay on the backend.",
    mcpDescriptionPlaceholder:
      "Describe the capabilities provided by this MCP service",
    mcpHealth: "Check health",
    mcpInterfaces: "interfaces",
    mcpDetails: "Interface details",
    mcpStatusUnknown: "Not checked",
    mcpStatusHealthy: "Healthy",
    mcpStatusDegraded: "Degraded",
    mcpStatusUnhealthy: "Unavailable",
    mcpLastChecked: "Last checked",
    mcpLatency: "Latency",
    mcpCapabilities: "Capabilities",
    mcpNoInterfaces: "No interface data. Run a health check first.",
    mcpCheckFailed: "Health check failed. Verify the URL and permissions.",
    mcpSaveFailed: "Failed to save the MCP service. Please try again.",
    mcpDeleteConfirm: (name: string) => `Delete MCP service “${name}”?`,
    mcpDeleted: (name: string) => `MCP service “${name}” deleted`,
    mcpErrorDetail: "Error details",
    mcpErrorHint:
      "Full error output. Copy to share or retry the health check below.",
    mcpErrorTooltip: "Click to view the full error",
    copied: "Copied to clipboard",
    copyFailed: "Copy failed. Select the text manually.",
    copy: "Copy",
    confirmDeleteTitle: "Confirm delete",
    cancelLabel: "Cancel",
    unsavedChangesTitle: "Unsaved changes",
    unsavedChangesDesc:
      "You have unsaved changes on this agent. Leave anyway? Changes will be lost.",
    unsavedTabChangeDesc:
      "This tab has unsaved changes. Switch anyway? Changes will be lost.",
    discardChanges: "Discard",
    stayHere: "Stay",
    deleteAgentEnabled: "This agent is enabled. Stop it before deleting.",
    agentDeleted: (name: string) => `Agent “${name}” deleted`,
    toolDeleted: (name: string) => `Tool “${name}” deleted`,
    skillDeleted: (name: string) => `Skill “${name}” deleted`,
    hookDeleted: (name: string) => `Hook “${name}” deleted`,
    documentDeleted: (name: string) => `Document “${name}” deleted`,
    toolsMenu: "Tools",
    skillsMenu: "Skill",
    skillsTitle: "Skill management",
    hooksMenu: "Hooks",
    hooksTitle: "Hook management",
    hooksSubtitle:
      "Run permission, page-context, and content validation before an Agent works.",
    newHook: "+ New hook",
    editHook: "Edit hook",
    hookName: "Name",
    hookNameRequired: "Enter a hook name",
    hookDescription: "Description (optional)",
    hookDescriptionPlaceholder: "Describe what this hook protects",
    hookPhase: "Execution phase",
    preAgent: "Before Agent execution",
    hookRuleType: "Validation rule",
    requirePermission: "Require page permission",
    requirePageContext: "Require page context",
    keywordBlock: "Block keywords",
    maxMessageLength: "Message length limit",
    hookRuleConfig: "Rule configuration (JSON)",
    hookRuleConfigPlaceholder: '{"permission":"readPage"}',
    hookFailureMessage: "Rejection message",
    hookFailureMessagePlaceholder: "Message shown when validation fails",
    hookPriority: "Priority",
    hookDeleteConfirm: (name: string) => `Delete hook “${name}”?`,
    hookSaveFailed:
      "Failed to save the hook. Check the configuration and try again.",
    hookDeleteFailed: "Failed to delete the hook. Please try again.",
    noHooks: "No hooks yet. Create a validation rule first.",
    router: "Router test",
    agentRatings: "Ratings / inspection",
    ratingsSubtitle:
      "Record user up/down feedback, analyze low ratings, and guide Agent improvements.",
    conversationLogs: "Conversation logs",
    conversationLogsSubtitle:
      "Review user messages, routing, and Agent execution by session.",
    agentConfig: "Agent configuration",
    routerTest: "System Agent router test",
    localMode: "Local mode",
    newAgent: "+ New Agent",
    newBase: "+ New knowledge base",
    enabled: "Enabled",
    disabled: "Disabled",
    noDescription: "No description",
    stop: "Disable",
    enable: "Enable",
    deleteAgent: "Delete",
    deleteAgentConfirm: (name: string) =>
      `Delete Agent “${name}”? This cannot be undone.`,
    deleteAgentDisabledHint: "Disable the Agent before deleting it",
    deleteAgentFailed: "Failed to delete the Agent. Please try again.",
    systemAgent: "System Agent",
    customAgent: "Custom Agent",
    systemAgentHint:
      "System Agents are built into the page assistant and cannot be deleted",
    customAgentHint: "Domain agents can be deleted after they are disabled",
    systemAgentPageHint:
      "Entry point: identifies user intent and routes to a general or domain Agent. Only one instance exists.",
    generalAgentPage: "General Agent",
    generalAgentPageHint:
      "Fallback node when no domain applies. Selectable by users and never delegates further.",
    domainAgentPage: "Domain Agent",
    domainAgentPageHint:
      "Receives routing from the System Agent. Can handle directly or delegate to bound sub-agents.",
    subAgentPage: "Sub-agent",
    subAgentPageHint:
      "Leaf node bound to and dispatched by a domain Agent. Not selectable by users.",
    supportedDocs: "Supports Markdown, TXT, and PDF documents",
    upload: "Upload document",
    processing: "Processing…",
    uploadHint: "Markdown, TXT, PDF, up to 10 MB",
    parsed: "Parsed",
    pending: "Pending",
    parseFailed: "Failed",
    reindex: "Reprocess",
    delete: "Delete",
    deleteConfirm: (name: string) => `Delete “${name}”?`,
    routerPlaceholder: "Enter a message to test routing",
    routerContextPlaceholder: "Page context (optional)",
    testRoute: "Test route",
    smartAnalyze: "Smart analysis",
    analyzing: "Analyzing…",
    routeChain: "Complete call chain",
    routeChainEmpty: "Run a route test to view the complete call chain.",
    routeAnalysis: "Smart analysis",
    routeAnalysisFailed: "Smart analysis failed. Please try again.",
    routeInput: "Receive user request",
    routeIntent: "System Agent intent recognition",
    routeDispatch: "Route dispatch",
    routeHooks: "Pre-Agent hook validation",
    hookPassed: "Passed",
    hookRejected: "Blocked",
    newAgentTitle: "New Agent",
    newAgentSubtitle:
      "Enter the basic information first; configure capabilities and resources after creation.",
    agentId: "Agent ID",
    agentIdHint: "Use 2-128 lowercase letters, numbers, and hyphens.",
    agentIdPlaceholder: "e.g. release-helper",
    displayName: "Display name",
    displayNamePlaceholder: "e.g. Release assistant",
    descriptionOptional: "Description (optional)",
    agentDescriptionPlaceholder: "Briefly describe what this Agent handles",
    systemPrompt: "System prompt",
    systemPromptPlaceholder:
      "Define the Agent role, boundaries, and response style",
    browserActions:
      "Allow browser action proposals (user confirmation is still required)",
    cancel: "Cancel",
    createAgent: "Confirm create Agent",
    editAgentTitle: "Agent settings",
    editAgentSubtitle:
      "Tune capabilities, prompts, and resource links. Changes apply immediately.",
    saveAgent: "Confirm save",
    saving: "Saving…",
    model: "Model (optional)",
    modelPlaceholder: "Leave empty to use the default model",
    temperature: "Temperature (optional)",
    priority: "Routing priority",
    knowledgeBases: "Knowledge base IDs (optional)",
    tools: "Tool bindings",
    skills: "Skill bindings",
    noTools: "No enabled tools. Enable tools in tool management first.",
    noSkills: "No enabled Skills. Enable Skills in Skill management first.",
    toolType: "Type",
    browserProposal: "Browser action",
    idsHint: "Separate multiple IDs with commas",
    creating: "Creating…",
    newBaseTitle: "New knowledge base",
    newBaseSubtitle:
      "Upload documents and use them for page-assistant retrieval.",
    baseName: "Name",
    baseNamePlaceholder: "e.g. Product operation manual",
    baseDescription: "Description",
    baseDescriptionPlaceholder: "Briefly describe this knowledge base",
    doubleClickToEdit: "Double-click the name or description to edit",
    createBase: "Create knowledge base",
    baseNameRequired: "Enter a knowledge base name",
    agentIdInvalid:
      "Agent ID must be 2-128 lowercase letters, numbers, or hyphens",
    agentNameRequired: "Agent name is required",
    promptRequired: "System prompt is required",
    parentAgentRequired: "A sub-agent must select an enabled domain Agent as its parent",
    createAgentFailed: "Failed to create Agent. Please try again.",
    createBaseFailed: "Failed to create knowledge base. Please try again.",
    uploadFailed: "Failed to upload document. Please try again.",
    reindexFailed: "Failed to reprocess document. Please try again.",
    deleteFailed: "Failed to delete document. Please try again.",
    settings: "Settings",
    language: "Language",
    chinese: "中文",
    english: "English",
    appearance: "Background",
    dark: "Dark",
    light: "Light",
    close: "Close",
    error: "Notice",
    enter: "Open maintenance",
    back: "Back to knowledge bases",
    maintenance: "Knowledge maintenance",
    qaSettings: "Q&A scene settings",
    documentCount: (count: number) =>
      `${count} document${count === 1 ? "" : "s"}`,
    noDocuments:
      "No documents yet. Upload files to start maintaining this base.",
    chooseDocuments: "Choose documents",
    viewDocument: "View details",
    documentDetails: "Document details",
    documentSize: "File size",
    documentHash: "File fingerprint",
    documentChunks: "Content chunks",
    loading: "Loading…",
    retrievalTest: "Retrieval test",
    retrievalPlaceholder: "Enter a question to test retrieval",
    runRetrieval: "Run retrieval",
    retrievalEmpty: "No matching content",
    retrievalFailed: "Retrieval failed. Check the Embedding configuration.",
    qaPrompt: "Q&A scene prompt",
    qaPromptPlaceholder:
      "Describe answer scope, tone, and citation requirements",
    topK: "Retrieval count",
    topKHint: "Maximum number of relevant chunks injected per question",
    saveSettings: "Save settings",
    save: "Save",
    saved: "Saved",
    collapseSidebar: "Collapse menu",
    expandSidebar: "Expand menu",
    testAgent: "Test",
    testAgentTitle: "Test Agent",
    testAgentSubtitle:
      "Simulate one conversation turn to verify the current prompt and capability configuration.",
    testMessage: "Test message",
    testMessagePlaceholder: "Enter a question for this Agent",
    testPageContext: "Page context (optional)",
    testPageContextPlaceholder:
      "Paste page information to verify context handling",
    runTest: "Run test",
    testing: "Testing…",
    testResponse: "Agent response",
    testFailed: "Agent test failed. Please try again.",
    agentSettingsPage: "Agent configuration",
    backToAgents: "Back to Agents",
    basicInfo: "Basic information",
    intentRouting: "Intent routing",
    agentRole: "Agent type",
    roleMain: "System Agent",
    roleGeneral: "General Agent",
    roleDomain: "Domain Agent",
    roleSub: "Sub-agent",
    parentAgent: "Parent domain Agent",
    handlingMode: "Handling strategy",
    directMode: "Handle directly",
    delegateMode: "Delegate to sub-agent",
    autoMode: "Automatic decision",
    returnMode: "Return strategy",
    childDirectMode: "Return sub-agent result",
    domainSummaryMode: "Summarize with domain Agent",
    childBinding: "Sub-agent bindings",
    noChildAgents: "No available sub-agents",
    childRoutingRule: "Intent keywords",
    childRoutingRuleHint:
      "Route here first when the request contains these keywords, separated by commas; leave empty to rely on automatic decision",
    childRoutingRulePlaceholder:
      "e.g. manifest, bill of lading, reconciliation",
    versions: "Version publishing",
    draft: "Draft",
    published: "Published",
    publish: "Publish configuration",
    rollback: "Rollback",
    publishedVersion: "Published version",
    intentRoutingHint:
      "Configure how the System Agent identifies intent, selects sub-agents, and handles low-confidence requests.",
    routingRules: "Assignment rules",
    routingRulesPlaceholder:
      "For example:\n- Page errors or API failures → route to the troubleshooting sub-agent\n- Product workflow questions → route to the relevant sub-agent\n- If uncertain → fall back to Intra Copilot",
    knowledgeBinding: "Knowledge bases",
    noKnowledgeBases: "No knowledge bases available. Create one first.",
    search: "Search",
    searchPlaceholder: "Search by name, ID, or description",
    statusFilter: "Status filter",
    allStatuses: "All statuses",
    noSearchResults: "No matching results.",
    noAgentOfType:
      "No Agent of this type yet. Use the button above to create one.",
    viewDetails: "View details",
    resourceDetails: "Resource details",
    capabilityBinding: "Tools and Skill",
    toolsTitle: "Tool management",
    toolsSubtitle: "Register backend API tools that Agents can call.",
    skillsSubtitle: "Register prompt-based skills that Agents can use.",
    newTool: "+ New tool",
    newSkill: "+ New Skill",
    tool: "Tool",
    skill: "Skill",
    toolName: "Name",
    toolTypeLabel: "Type",
    endpoint: "Endpoint (HTTP / HTTPS)",
    method: "HTTP method",
    toolDescriptionPlaceholder: "Describe what this tool can do",
    endpointPlaceholder:
      "http://127.0.0.1:8080/api or https://api.example.com/resource",
    endpointHint:
      "HTTP/HTTPS and local or private services are supported; disable insecure access in production.",
    mcpServerUrl: "MCP server URL (HTTP / HTTPS)",
    mcpServerUrlPlaceholder:
      "http://127.0.0.1:3000/mcp or https://mcp.example.com/mcp",
    mcpTransport: "MCP transport",
    mcpSse: "SSE",
    mcpStreamableHttp: "Streamable HTTP",
    mcpAuthEnv: "Auth environment variable (optional)",
    mcpAuthEnvPlaceholder: "e.g. MCP_API_TOKEN",
    mcpServerRequired: "MCP tools require a server URL",
    skillPrompt: "Skill prompt",
    skillPromptPlaceholder: "Define the Skill behavior and boundaries",
    version: "Version",
    noResources: "No resources yet. Create a tool or Skill first.",
    edit: "Edit",
    deleteResource: "Delete",
    deleteResourceConfirm: (name: string) =>
      `Delete “${name}”? This cannot be undone.`,
    deleteDisabledEnabled: "Enabled items cannot be deleted. Disable them first.",
    resourceNameRequired: "Enter a name",
    nameExists: "This name already exists. Choose another name.",
    endpointRequired: "HTTP tools require an Endpoint",
    skillPromptRequired: "Skill prompt is required",
    resourceSaveFailed: "Failed to save the resource. Please try again.",
    resourceDeleteFailed: "Failed to delete the resource. Please try again.",
    saveResource: "Save",
    createResource: "Create",
    ratingUp: "Up",
    ratingDown: "Down",
    noFeedback: "No feedback yet. Ratings from the extension will appear here.",
    totalFeedback: "Total feedback",
    satisfactionRate: "Satisfaction",
    downReasons: "Down-rating reasons",
    improvementSuggestions: "Improvement guidance",
    feedbackContext: "Feedback context",
    userQuestion: "User question",
    assistantAnswer: "Agent answer",
    noReason: "No reason provided",
    missingReasonCount: (n: number) =>
      `${n} downvotes are missing a reason. Contact the author for context.`,
    noConversationLogs:
      "No conversation logs yet. Logs will appear after users chat from the extension.",
    userMessage: "User",
    assistantMessage: "Assistant",
    invocationDetails: "Agent invocations",
    actionDetails: "Browser action proposals",
    route: "Route",
    duration: "Duration",
    confidence: "Confidence",
    routeSource: "Route source",
    intentResult: "Intent recognition",
    contextTransfer: "Context sent to sub-agent",
    responseTransfer: "Sub-agent response handling",
    routeTrail: "Routing trail",
    clientIp: "Client IP",
    actionPending: "Pending",
    actionCompleted: "Completed",
    actionFailed: "Failed",
    conversationSessionId: "Session ID",
    conversationSessionIdPlaceholder: "Enter session ID",
    conversationTitle: "Title",
    updatedAt: "Updated at",
    messageCount: "Messages",
    detail: "Details",
    query: "Search",
    reset: "Reset",
    perPage: "per page",
    prevPage: "Previous",
    nextPage: "Next",
    paginationTotal: (total: number) => `Total ${total} items`,
    paginationPosition: (page: number, totalPages: number) =>
      `Page ${page} / ${totalPages}`,
    conversationDetailTitle: "Conversation detail",
  },
} as const;

type Agent = {
  id: string;
  displayName: string;
  description?: string;
  role?: "MAIN" | "GENERAL" | "DOMAIN" | "SUB" | string;
  parentAgentId?: string;
  handlingMode?: "DIRECT" | "DELEGATE" | "AUTO" | string;
  returnMode?: "CHILD_DIRECT" | "DOMAIN_SUMMARY" | string;
  enabled: boolean;
  published?: boolean;
  publishedVersion?: number;
  systemPrompt: string;
  systemAgent?: boolean;
  supportsBrowserActions?: boolean;
  priority?: number;
  routingRules?: string;
  model?: string;
  temperature?: number;
  knowledgeBaseIds?: string;
  toolIds?: string;
  skillIds?: string;
};

type AgentConfigVersion = {
  id: string;
  agentId: string;
  version: number;
  status: string;
  snapshot?: string;
  releaseNote?: string;
  createdAt?: string;
};

type AgentChildBinding = {
  id: string;
  parentAgentId: string;
  childAgentId: string;
  priority?: number;
  routingRule?: string;
  enabled: boolean;
};

type ToolDefinition = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  method?: string;
  endpoint?: string;
  mcpServerUrl?: string;
  mcpTransport?: string;
  mcpAuthEnv?: string;
  enabled: boolean;
};

type McpInterface = {
  name?: string;
  description?: string;
  inputSchema?: unknown;
  [key: string]: unknown;
};

type McpServer = {
  id: string;
  name: string;
  description?: string;
  serverUrl: string;
  transport: "SSE" | "STREAMABLE_HTTP" | string;
  authEnv?: string;
  enabled: boolean;
  status?: "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNHEALTHY" | string;
  interfaceCount?: number;
  interfacesJson?: string;
  capabilitiesJson?: string;
  lastError?: string;
  lastCheckedAt?: string;
  lastLatencyMs?: number;
};

type SkillDefinition = {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  version?: string;
  enabled: boolean;
};

type HookDefinition = {
  id: string;
  name: string;
  description?: string;
  phase: string;
  ruleType: string;
  ruleConfig: string;
  failureMessage?: string;
  priority: number;
  enabled: boolean;
};

type ResourceDetails =
  | { kind: "tool"; resource: ToolDefinition }
  | { kind: "skill"; resource: SkillDefinition };

type AgentFeedback = {
  id: string;
  sessionId?: string;
  messageId?: string;
  messageIndex?: number;
  agentId?: string;
  rating: "up" | "down";
  comment?: string;
  messageContent?: string;
  userMessage?: string;
  createdAt?: string;
};
type FeedbackSummary = {
  total: number;
  up: number;
  down: number;
  satisfactionRate: number;
  byAgent: Record<string, number>;
  downReasons: Record<string, number>;
  suggestions: string[];
};

type Base = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  embeddingProfileId?: string;
};
type EmbeddingProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  dimension: number;
  enabled: boolean;
  defaultProfile: boolean;
  configVersion?: string;
};
type EmbeddingConfig = {
  profile: EmbeddingProfile;
  inheritedOrResolved: boolean;
};
type EmbeddingValidation = {
  reachable: boolean;
  profile: EmbeddingProfile;
  actualDimension?: number;
  latencyMs: number;
  error?: string;
};
type KnowledgeDiagnostics = {
  issues: string[];
  documentCount: number;
  errorCount: number;
  embeddingTableExists: boolean;
};

type KnowledgeDocument = {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  mediaType?: string;
  status: "PENDING" | "INDEXING" | "READY" | "ERROR" | string;
  error?: string;
  fileHash?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

type DocumentChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
};

type RetrievalResult = {
  documentId: string;
  filename: string;
  pageNumber?: number;
  content: string;
  distance: number;
};

type QASceneSettings = {
  prompt: string;
  topK: number;
};

type ConversationLog = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messages: {
    id: string;
    role: string;
    content: string;
    agentId?: string;
    contextSummary?: string;
    createdAt?: string;
  }[];
  invocations: {
    id: string;
    requestedAgentId?: string;
    selectedAgentId?: string;
    routeReason?: string;
    confidence?: number;
    routeSource?: string;
    intent?: string;
    contextSent?: string;
    responseContent?: string;
    clientIp?: string;
    durationMs?: number;
    error?: string;
    createdAt?: string;
  }[];
  actions: {
    actionId: string;
    type?: string;
    target?: string;
    reason?: string;
    risk?: string;
    status?: string;
    result?: string;
    expiresAt?: string;
  }[];
};

type ConversationLogSummary = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
};

type ConversationLogPage = {
  items: ConversationLogSummary[];
  total: number;
  page: number;
  size: number;
};

type AgentPreset = {
  id: string;
  displayName: string;
  systemPrompt: string;
};

const AGENT_PRESETS: Record<Language, Record<string, AgentPreset>> = {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `请求失败（${response.status}）`);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    return localStorage.getItem("admin-language") === "en" ? "en" : "zh";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    return localStorage.getItem("admin-theme") === "light" ? "light" : "dark";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("admin-sidebar-collapsed") === "true",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversationLogs, setConversationLogs] = useState<
    ConversationLogSummary[]
  >([]);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationPageSize, setConversationPageSize] = useState(30);
  const [conversationSessionId, setConversationSessionId] = useState("");
  const [conversationSessionIdDraft, setConversationSessionIdDraft] =
    useState("");
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationDetail, setConversationDetail] = useState<ConversationLog>();
  const [conversationDetailOpen, setConversationDetailOpen] = useState(false);
  const [conversationDetailLoading, setConversationDetailLoading] =
    useState(false);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [editingMcpId, setEditingMcpId] = useState<string>();
  const [mcpName, setMcpName] = useState("");
  const [mcpDescription, setMcpDescription] = useState("");
  const [mcpServerUrl, setMcpServerUrl] = useState("");
  const [mcpTransport, setMcpTransport] = useState("STREAMABLE_HTTP");
  const [mcpAuthEnv, setMcpAuthEnv] = useState("");
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [mcpSubmitting, setMcpSubmitting] = useState(false);
  const [mcpActionId, setMcpActionId] = useState<string>();
  const [mcpDetails, setMcpDetails] = useState<McpServer>();
  const [mcpErrorDetail, setMcpErrorDetail] = useState<McpServer | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [hooks, setHooks] = useState<HookDefinition[]>([]);
  const [feedback, setFeedback] = useState<AgentFeedback[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummary>();
  const [resourceDialog, setResourceDialog] = useState<"tool" | "skill">();
  const [editingResourceId, setEditingResourceId] = useState<string>();
  const [resourceName, setResourceName] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [resourceType, setResourceType] = useState("BROWSER_PROPOSAL");
  const [resourceMethod, setResourceMethod] = useState("POST");
  const [resourceEndpoint, setResourceEndpoint] = useState("");
  const [resourcePrompt, setResourcePrompt] = useState("");
  const [resourceVersion, setResourceVersion] = useState("1.0.0");
  const [resourceEnabled, setResourceEnabled] = useState(true);
  const [resourceSubmitting, setResourceSubmitting] = useState(false);
  const [resourceError, setResourceError] = useState("");
  const [resourceActionId, setResourceActionId] = useState<string>();
  const [resourceDetails, setResourceDetails] = useState<
    ResourceDetails | undefined
  >();
  const [confirmRequest, setConfirmRequest] = useState<{
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    tone: "danger" | "primary";
    loading: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const closeConfirm = () => setConfirmRequest(null);
  const runConfirm = async () => {
    if (!confirmRequest) return;
    try {
      await confirmRequest.onConfirm();
    } finally {
      setConfirmRequest((prev) => (prev ? { ...prev, loading: false } : prev));
    }
  };
  const askConfirm = (options: {
    title: string;
    description?: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    tone?: "danger" | "primary";
    onConfirm: () => void | Promise<void>;
  }) => {
    setConfirmRequest({
      title: options.title,
      description: options.description,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      tone: options.tone ?? "primary",
      loading: true,
      onConfirm: options.onConfirm,
    });
  };
  const [hookDialogOpen, setHookDialogOpen] = useState(false);
  const [editingHookId, setEditingHookId] = useState<string>();
  const [hookName, setHookName] = useState("");
  const [hookDescription, setHookDescription] = useState("");
  const [hookRuleType, setHookRuleType] = useState("REQUIRE_PERMISSION");
  const [hookRuleConfig, setHookRuleConfig] = useState(
    '{"permission":"readPage"}',
  );
  const [hookFailureMessage, setHookFailureMessage] = useState("");
  const [hookPriority, setHookPriority] = useState(100);
  const [hookEnabled, setHookEnabled] = useState(true);
  const [hookSubmitting, setHookSubmitting] = useState(false);
  const [hookActionId, setHookActionId] = useState<string>();
  const [bases, setBases] = useState<Base[]>([]);
  const [documents, setDocuments] = useState<
    Record<string, KnowledgeDocument[]>
  >({});
  const [uploadingBaseId, setUploadingBaseId] = useState<string>();
  const [uploadError, setUploadError] = useState("");
  const [documentActionId, setDocumentActionId] = useState<string>();
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDocument>();
  const [documentChunks, setDocumentChunks] = useState<DocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [retrievalResults, setRetrievalResults] = useState<RetrievalResult[]>(
    [],
  );
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrievalError, setRetrievalError] = useState("");
  const [activeBaseId, setActiveBaseId] = useState<string>();
  const [editingBase, setEditingBase] = useState(false);
  const [baseDraftName, setBaseDraftName] = useState("");
  const [baseDraftDescription, setBaseDraftDescription] = useState("");
  const [baseSaving, setBaseSaving] = useState(false);
  const [knowledgeSection, setKnowledgeSection] = useState<
    "maintenance" | "qa" | "retrieval"
  >("maintenance");
  const [qaSettings, setQaSettings] = useState<Record<string, QASceneSettings>>(
    {},
  );
  const [qaSaved, setQaSaved] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [tab, setTab] = useState("agents");
  const [agentMenuOpen, setAgentMenuOpen] = useState(
    () => localStorage.getItem("admin-agent-menu-open") !== "false",
  );
  const [agentReturnTab, setAgentReturnTab] = useState("agents");
  const [resourceStatus, setResourceStatus] = useState<
    "all" | "enabled" | "disabled"
  >("all");
  const [message, setMessage] = useState("");
  const [routePageContext, setRoutePageContext] = useState("");
  const [route, setRoute] = useState<Record<string, unknown>>();
  const [routeAnalysis, setRouteAnalysis] = useState("");
  const [routeAnalyzing, setRouteAnalyzing] = useState(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string>();
  const [agentConfigId, setAgentConfigId] = useState<string>();
  const [agentConfigSection, setAgentConfigSection] = useState<
    | "basic"
    | "routing"
    | "strategy"
    | "children"
    | "knowledge"
    | "tools"
    | "skills"
    | "versions"
  >("basic");
  const [agentId, setAgentId] = useState("custom-agent");
  const [agentDisplayName, setAgentDisplayName] = useState("领域 Agent");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentSystemPrompt, setAgentSystemPrompt] =
    useState("你是一个页面助手领域 Agent。");
  const [agentBrowserActions, setAgentBrowserActions] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentPriority, setAgentPriority] = useState(100);
  const [agentRoutingRules, setAgentRoutingRules] = useState("");
  const [agentRole, setAgentRole] = useState("DOMAIN");
  const [agentParentId, setAgentParentId] = useState("");
  const [agentHandlingMode, setAgentHandlingMode] = useState("AUTO");
  const [agentReturnMode, setAgentReturnMode] = useState("CHILD_DIRECT");
  const [agentChildIds, setAgentChildIds] = useState<string[]>([]);
  const [agentChildRules, setAgentChildRules] = useState<
    Record<string, string>
  >({});
  const [agentChildSearch, setAgentChildSearch] = useState("");
  const [agentVersions, setAgentVersions] = useState<AgentConfigVersion[]>([]);
  const [agentModel, setAgentModel] = useState("");
  const [agentTemperature, setAgentTemperature] = useState("");
  const [agentKnowledgeBaseIds, setAgentKnowledgeBaseIds] = useState("");
  const [agentToolIds, setAgentToolIds] = useState<string[]>([]);
  const [agentSkillIds, setAgentSkillIds] = useState<string[]>([]);
  const [agentKnowledgeSearch, setAgentKnowledgeSearch] = useState("");
  const [agentToolSearch, setAgentToolSearch] = useState("");
  const [agentSkillSearch, setAgentSkillSearch] = useState("");
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentActionId, setAgentActionId] = useState<string>();
  const [agentTestDialogOpen, setAgentTestDialogOpen] = useState(false);
  const [testingAgent, setTestingAgent] = useState<Agent>();
  const [agentTestMessage, setAgentTestMessage] = useState("");
  const [agentTestContext, setAgentTestContext] = useState("");
  const [agentTestResult, setAgentTestResult] = useState("");
  const [agentTestError, setAgentTestError] = useState("");
  const [agentTestSubmitting, setAgentTestSubmitting] = useState(false);
  const [baseDialogOpen, setBaseDialogOpen] = useState(false);
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [baseSubmitting, setBaseSubmitting] = useState(false);
  const [baseError, setBaseError] = useState("");
  const [embeddingProfiles, setEmbeddingProfiles] = useState<
    EmbeddingProfile[]
  >([]);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>();
  const [embeddingValidation, setEmbeddingValidation] =
    useState<EmbeddingValidation>();
  const [embeddingSaving, setEmbeddingSaving] = useState(false);
  const [knowledgeDiagnostics, setKnowledgeDiagnostics] =
    useState<KnowledgeDiagnostics>();
  const t = translations[language];

  const parseIds = (value?: string) => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string");
      }
    } catch {
      // Older records may use comma-separated IDs.
    }
    return value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  };

  const normalizedName = (value: string) => value.trim().toLocaleLowerCase();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("admin-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("admin-language", language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem("admin-agent-menu-open", String(agentMenuOpen));
  }, [agentMenuOpen]);

  useEffect(() => {
    if (
      ["agents-general", "agents-domain", "agents-sub"].includes(tab) &&
      !agentMenuOpen
    ) {
      setAgentMenuOpen(true);
    }
  }, [tab]);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("admin-qa-settings") ?? "{}",
      );
      if (stored && typeof stored === "object") setQaSettings(stored);
    } catch {
      setQaSettings({});
    }
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

  const loadAgents = () => {
    request<Agent[]>("/admin/agents")
      .then(setAgents)
      .catch(() => setAgents([]));
  };

  const loadConversationLogs = () => {
    setConversationLoading(true);
    const params = new URLSearchParams({
      page: String(conversationPage),
      size: String(conversationPageSize),
    });
    if (conversationSessionId.trim()) {
      params.set("sessionId", conversationSessionId.trim());
    }
    request<ConversationLogPage>(
      `/admin/conversation-logs?${params.toString()}`,
    )
      .then((data) => {
        setConversationLogs(data.items);
        setConversationTotal(data.total);
        // 过滤或翻页后当前页可能超出范围，回退到最后一页
        if (data.items.length === 0 && data.total > 0 && data.page > 1) {
          setConversationPage(
            Math.max(1, Math.ceil(data.total / data.size)),
          );
        }
      })
      .catch(() => {
        setConversationLogs([]);
        setConversationTotal(0);
      })
      .finally(() => setConversationLoading(false));
  };

  const openConversationDetail = (id: string) => {
    setConversationDetail(undefined);
    setConversationDetailOpen(true);
    setConversationDetailLoading(true);
    request<ConversationLog>(`/admin/conversation-logs/${id}`)
      .then(setConversationDetail)
      .catch(() => setConversationDetail(undefined))
      .finally(() => setConversationDetailLoading(false));
  };

  const loadTools = () => {
    request<ToolDefinition[]>("/admin/tools")
      .then(setTools)
      .catch(() => setTools([]));
  };

  const loadMcpServers = () => {
    request<McpServer[]>("/admin/mcp-servers")
      .then(setMcpServers)
      .catch(() => setMcpServers([]));
  };

  const loadSkills = () => {
    request<SkillDefinition[]>("/admin/skills")
      .then(setSkills)
      .catch(() => setSkills([]));
  };

  const loadHooks = () => {
    request<HookDefinition[]>("/admin/hooks")
      .then(setHooks)
      .catch(() => setHooks([]));
  };

  const loadFeedback = () => {
    request<AgentFeedback[]>("/admin/agent-feedback")
      .then(setFeedback)
      .catch(() => setFeedback([]));
    request<FeedbackSummary>("/admin/agent-feedback/summary")
      .then(setFeedbackSummary)
      .catch(() => setFeedbackSummary(undefined));
  };

  const loadBases = () => {
    request<Base[]>("/admin/knowledge-bases")
      .then((list) => {
        setBases(list);
        Promise.all(
          list.map(async (base) => {
            try {
              return [
                base.id,
                await request<KnowledgeDocument[]>(
                  `/admin/knowledge-bases/${base.id}/documents`,
                ),
              ] as const;
            } catch {
              return [base.id, []] as const;
            }
          }),
        ).then((entries) => setDocuments(Object.fromEntries(entries)));
      })
      .catch(() => {
        setBases([]);
        setDocuments({});
      });
    request<EmbeddingProfile[]>("/admin/embedding-profiles")
      .then(setEmbeddingProfiles)
      .catch(() => setEmbeddingProfiles([]));
  };

  // 记录已按需加载过的资源，避免进入页面时重复请求
  const loadedResources = useRef<Set<string>>(new Set());
  const [agentConfigDirty, setAgentConfigDirty] = useState(false);
  const agentConfigSeeded = useRef(false);

  // Reset the dirty tracker whenever a new agent config is opened.
  useEffect(() => {
    if (agentConfigId) {
      agentConfigSeeded.current = false;
      setAgentConfigDirty(false);
    }
  }, [agentConfigId]);

  // Mark the form dirty whenever any field changes after the initial seed
  // completes. We rely on `openAgentSettings` calling each `setX` first;
  // these renders land before the seed completes, so dirty stays false.
  useEffect(() => {
    if (!agentConfigId) return;
    if (!agentConfigSeeded.current) {
      agentConfigSeeded.current = true;
      return;
    }
    setAgentConfigDirty(true);
  }, [
    agentId,
    agentDisplayName,
    agentDescription,
    agentSystemPrompt,
    agentBrowserActions,
    agentEnabled,
    agentPriority,
    agentRoutingRules,
    agentRole,
    agentParentId,
    agentHandlingMode,
    agentReturnMode,
    agentModel,
    agentTemperature,
    agentKnowledgeBaseIds,
    agentToolIds,
    agentSkillIds,
    agentChildIds,
    agentChildRules,
  ]);
  const ensureResourceLoaded = (key: string, loader: () => void) => {
    if (loadedResources.current.has(key)) return;
    loadedResources.current.add(key);
    loader();
  };

  // 根据当前 tab 按需加载对应资源，默认进入 agents 页面只请求 agents
  useEffect(() => {
    const agentTabs = [
      "agents",
      "agents-general",
      "agents-domain",
      "agents-sub",
    ];
    if (agentTabs.includes(tab)) {
      ensureResourceLoaded("agents", loadAgents);
    } else if (tab === "agent-settings") {
      // Agent 配置页的 knowledge/tools/skills 绑定区需要对应列表数据
      ensureResourceLoaded("agents", loadAgents);
      ensureResourceLoaded("bases", loadBases);
      ensureResourceLoaded("tools", loadTools);
      ensureResourceLoaded("skills", loadSkills);
    } else if (tab === "knowledge") {
      ensureResourceLoaded("bases", loadBases);
    } else if (tab === "mcp-servers") {
      ensureResourceLoaded("mcp-servers", loadMcpServers);
    } else if (tab === "tools") {
      ensureResourceLoaded("tools", loadTools);
    } else if (tab === "skills") {
      ensureResourceLoaded("skills", loadSkills);
    } else if (tab === "hooks") {
      ensureResourceLoaded("hooks", loadHooks);
    } else if (tab === "ratings") {
      ensureResourceLoaded("feedback", loadFeedback);
    }
  }, [tab]);

  // 对话日志：进入页面或翻页/改每页条数/切换过滤条件时重新拉取
  useEffect(() => {
    if (tab !== "conversation-logs") return;
    loadConversationLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, conversationPage, conversationPageSize, conversationSessionId]);

  useEffect(() => {
    if (!activeBaseId) {
      setEmbeddingConfig(undefined);
      return;
    }
    request<EmbeddingConfig>(
      `/admin/knowledge-bases/${activeBaseId}/embedding-config`,
    )
      .then(setEmbeddingConfig)
      .catch(() => setEmbeddingConfig(undefined));
  }, [activeBaseId]);

  const openMcpDialog = (server?: McpServer) => {
    setEditingMcpId(server?.id);
    setMcpName(server?.name ?? "");
    setMcpDescription(server?.description ?? "");
    setMcpServerUrl(server?.serverUrl ?? "");
    setMcpTransport(server?.transport ?? "STREAMABLE_HTTP");
    setMcpAuthEnv(server?.authEnv ?? "");
    setMcpEnabled(server?.enabled ?? true);
    setResourceError("");
    setMcpDialogOpen(true);
  };

  const closeMcpDialog = () => {
    if (!mcpSubmitting) setMcpDialogOpen(false);
  };

  const saveMcpServer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = mcpName.trim();
    const url = mcpServerUrl.trim();
    if (!name) return setResourceError(t.resourceNameRequired);
    if (!url) return setResourceError(t.mcpServerRequired);
    if (
      mcpServers.some(
        (item) =>
          item.id !== editingMcpId &&
          normalizedName(item.name) === normalizedName(name),
      )
    ) {
      return setResourceError(t.nameExists);
    }
    setMcpSubmitting(true);
    setResourceError("");
    try {
      const path = editingMcpId
        ? `/admin/mcp-servers/${editingMcpId}`
        : "/admin/mcp-servers";
      await request(path, {
        method: editingMcpId ? "PUT" : "POST",
        body: JSON.stringify({
          id: editingMcpId,
          name,
          description: mcpDescription.trim(),
          serverUrl: url,
          transport: mcpTransport,
          authEnv: mcpAuthEnv.trim() || null,
          enabled: mcpEnabled,
        }),
      });
      setMcpDialogOpen(false);
      loadMcpServers();
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.mcpSaveFailed,
      );
    } finally {
      setMcpSubmitting(false);
    }
  };

  const checkMcpHealth = async (server: McpServer) => {
    setMcpActionId(server.id);
    try {
      const updated = await request<McpServer>(
        `/admin/mcp-servers/${server.id}/health`,
        { method: "POST" },
      );
      setMcpServers((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (mcpDetails?.id === updated.id) setMcpDetails(updated);
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.mcpCheckFailed,
      );
    } finally {
      setMcpActionId(undefined);
    }
  };

  const deleteMcpServer = async (server: McpServer) => {
    if (server.enabled) {
      setResourceError(t.deleteDisabledEnabled);
      return;
    }
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.mcpDeleteConfirm(server.name),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setMcpActionId(server.id);
        try {
          await request(`/admin/mcp-servers/${server.id}`, { method: "DELETE" });
          setMcpServers((items) => items.filter((item) => item.id !== server.id));
          if (mcpDetails?.id === server.id) setMcpDetails(undefined);
          toast.success(t.mcpDeleted(server.name));
        } catch (error) {
          setResourceError(
            error instanceof Error ? error.message : t.resourceDeleteFailed,
          );
          throw error;
        } finally {
          setMcpActionId(undefined);
        }
      },
    });
  };

  const toggleMcpServer = async (server: McpServer) => {
    setMcpActionId(server.id);
    try {
      const updated = await request<McpServer>(
        `/admin/mcp-servers/${server.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ ...server, enabled: !server.enabled }),
        },
      );
      setMcpServers((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.mcpSaveFailed,
      );
    } finally {
      setMcpActionId(undefined);
    }
  };

  const parseMcpInterfaces = (server: McpServer): McpInterface[] => {
    try {
      const parsed = JSON.parse(server.interfacesJson ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const mcpStatusLabel = (status?: string) => {
    if (status === "HEALTHY") return t.mcpStatusHealthy;
    if (status === "DEGRADED") return t.mcpStatusDegraded;
    if (status === "UNHEALTHY") return t.mcpStatusUnhealthy;
    return t.mcpStatusUnknown;
  };

  const truncateError = (text: string, maxLength = 80) => {
    const flat = text.replace(/\s+/g, " ").trim();
    if (flat.length <= maxLength) return flat;
    return `${flat.slice(0, maxLength - 1)}…`;
  };

  const copyMcpError = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t.copied);
    } catch {
      toast.error(t.copyFailed);
    }
  };

  const openResourceDialog = (
    kind: "tool" | "skill",
    resource?: ToolDefinition | SkillDefinition,
  ) => {
    setResourceDialog(kind);
    setEditingResourceId(resource?.id);
    setResourceName(resource?.name ?? "");
    setResourceDescription(resource?.description ?? "");
    setResourceEnabled(resource?.enabled ?? true);
    setResourceError("");
    if (kind === "tool") {
      const tool = resource as ToolDefinition | undefined;
      setResourceType(tool?.type ?? "BROWSER_PROPOSAL");
      setResourceMethod(tool?.method ?? "POST");
      setResourceEndpoint(tool?.endpoint ?? "");
    } else {
      const skill = resource as SkillDefinition | undefined;
      setResourcePrompt(skill?.prompt ?? "");
      setResourceVersion(skill?.version ?? "1.0.0");
    }
  };

  const closeResourceDialog = () => {
    if (!resourceSubmitting) setResourceDialog(undefined);
  };

  const saveResource = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resourceDialog) return;
    const name = resourceName.trim();
    if (!name) {
      setResourceError(t.resourceNameRequired);
      return;
    }
    const resourceNames =
      resourceDialog === "tool"
        ? tools.map((item) => ({ id: item.id, name: item.name }))
        : skills.map((item) => ({ id: item.id, name: item.name }));
    if (
      resourceNames.some(
        (item) =>
          item.id !== editingResourceId &&
          normalizedName(item.name) === normalizedName(name),
      )
    ) {
      setResourceError(t.nameExists);
      return;
    }
    if (
      resourceDialog === "tool" &&
      resourceType === "HTTP" &&
      !resourceEndpoint.trim()
    ) {
      setResourceError(t.endpointRequired);
      return;
    }
    if (resourceDialog === "skill" && !resourcePrompt.trim()) {
      setResourceError(t.skillPromptRequired);
      return;
    }
    setResourceSubmitting(true);
    setResourceError("");
    try {
      const path = editingResourceId
        ? `/admin/${resourceDialog === "tool" ? "tools" : "skills"}/${editingResourceId}`
        : `/admin/${resourceDialog === "tool" ? "tools" : "skills"}`;
      const body =
        resourceDialog === "tool"
          ? {
              id: editingResourceId,
              name,
              description: resourceDescription.trim(),
              type: resourceType,
              method: resourceMethod,
              endpoint: resourceEndpoint.trim() || null,
              enabled: resourceEnabled,
            }
          : {
              id: editingResourceId,
              name,
              description: resourceDescription.trim(),
              prompt: resourcePrompt.trim(),
              version: resourceVersion.trim() || "1.0.0",
              enabled: resourceEnabled,
            };
      await request(path, {
        method: editingResourceId ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setResourceDialog(undefined);
      if (resourceDialog === "tool") loadTools();
      else loadSkills();
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.resourceSaveFailed,
      );
    } finally {
      setResourceSubmitting(false);
    }
  };

  const toggleResource = async (
    kind: "tool" | "skill",
    resource: ToolDefinition | SkillDefinition,
  ) => {
    setResourceActionId(resource.id);
    try {
      await request(
        `/admin/${kind === "tool" ? "tools" : "skills"}/${resource.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ ...resource, enabled: !resource.enabled }),
        },
      );
      if (kind === "tool") loadTools();
      else loadSkills();
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.resourceSaveFailed,
      );
    } finally {
      setResourceActionId(undefined);
    }
  };

  const deleteResource = async (
    kind: "tool" | "skill",
    resource: ToolDefinition | SkillDefinition,
  ) => {
    if (resource.enabled) {
      setResourceError(t.deleteDisabledEnabled);
      return;
    }
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.deleteResourceConfirm(resource.name),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setResourceActionId(resource.id);
        try {
          await request(
            `/admin/${kind === "tool" ? "tools" : "skills"}/${resource.id}`,
            {
              method: "DELETE",
            },
          );
          if (kind === "tool") loadTools();
          else loadSkills();
          toast.success(
            kind === "tool" ? t.toolDeleted(resource.name) : t.skillDeleted(resource.name),
          );
        } catch (error) {
          setResourceError(
            error instanceof Error ? error.message : t.resourceDeleteFailed,
          );
          throw error;
        } finally {
          setResourceActionId(undefined);
        }
      },
    });
  };

  const openHookDialog = (hook?: HookDefinition) => {
    setEditingHookId(hook?.id);
    setHookName(hook?.name ?? "");
    setHookDescription(hook?.description ?? "");
    setHookRuleType(hook?.ruleType ?? "REQUIRE_PERMISSION");
    setHookRuleConfig(hook?.ruleConfig ?? '{"permission":"readPage"}');
    setHookFailureMessage(hook?.failureMessage ?? "");
    setHookPriority(hook?.priority ?? 100);
    setHookEnabled(hook?.enabled ?? true);
    setHookDialogOpen(true);
  };

  const saveHook = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hookName.trim()) return setResourceError(t.hookNameRequired);
    try {
      JSON.parse(hookRuleConfig || "{}");
    } catch {
      return setResourceError(t.hookRuleConfig);
    }
    setHookSubmitting(true);
    setResourceError("");
    try {
      const payload = {
        id: editingHookId,
        name: hookName.trim(),
        description: hookDescription.trim(),
        phase: "PRE_AGENT",
        ruleType: hookRuleType,
        ruleConfig: hookRuleConfig.trim() || "{}",
        failureMessage: hookFailureMessage.trim(),
        priority: Math.max(0, Math.min(10000, Number(hookPriority) || 0)),
        enabled: hookEnabled,
      };
      const saved = await request<HookDefinition>(
        editingHookId ? `/admin/hooks/${editingHookId}` : "/admin/hooks",
        {
          method: editingHookId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setHooks((current) =>
        editingHookId
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...current],
      );
      setHookDialogOpen(false);
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.hookSaveFailed,
      );
    } finally {
      setHookSubmitting(false);
    }
  };

  const toggleHook = async (hook: HookDefinition) => {
    setHookActionId(hook.id);
    try {
      const updated = await request<HookDefinition>(`/admin/hooks/${hook.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...hook, enabled: !hook.enabled }),
      });
      setHooks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setResourceError(
        error instanceof Error ? error.message : t.hookSaveFailed,
      );
    } finally {
      setHookActionId(undefined);
    }
  };

  const deleteHook = async (hook: HookDefinition) => {
    if (hook.enabled) {
      setResourceError(t.deleteDisabledEnabled);
      return;
    }
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.hookDeleteConfirm(hook.name),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setHookActionId(hook.id);
        try {
          await request(`/admin/hooks/${hook.id}`, { method: "DELETE" });
          setHooks((current) => current.filter((item) => item.id !== hook.id));
          toast.success(t.hookDeleted(hook.name));
        } catch (error) {
          setResourceError(
            error instanceof Error ? error.message : t.hookDeleteFailed,
          );
          throw error;
        } finally {
          setHookActionId(undefined);
        }
      },
    });
  };

  useEffect(() => {
    if (
      !baseDialogOpen &&
      !agentDialogOpen &&
      !agentTestDialogOpen &&
      !resourceDialog &&
      !hookDialogOpen &&
      !mcpDialogOpen
    )
      return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (baseDialogOpen && !baseSubmitting) {
        setBaseDialogOpen(false);
      }
      if (agentDialogOpen && !agentSubmitting) {
        setAgentDialogOpen(false);
      }
      if (agentTestDialogOpen && !agentTestSubmitting) {
        setAgentTestDialogOpen(false);
      }
      if (resourceDialog && !resourceSubmitting) {
        setResourceDialog(undefined);
      }
      if (hookDialogOpen && !hookSubmitting) {
        setHookDialogOpen(false);
      }
      if (mcpDialogOpen && !mcpSubmitting) {
        setMcpDialogOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    agentDialogOpen,
    agentSubmitting,
    agentTestDialogOpen,
    agentTestSubmitting,
    baseDialogOpen,
    baseSubmitting,
    resourceDialog,
    resourceSubmitting,
    hookDialogOpen,
    hookSubmitting,
    mcpDialogOpen,
    mcpSubmitting,
  ]);

  const activeBase = bases.find((base) => base.id === activeBaseId);
  const activeQaSettings: QASceneSettings = activeBaseId
    ? (qaSettings[activeBaseId] ?? { prompt: "", topK: 5 })
    : { prompt: "", topK: 5 };

  const openKnowledgeBase = (base: Base) => {
    setActiveBaseId(base.id);
    setEditingBase(false);
    setBaseDraftName(base.name);
    setBaseDraftDescription(base.description ?? "");
    setKnowledgeSection("maintenance");
    setUploadError("");
    setQaSaved(false);
  };

  const closeKnowledgeBase = () => {
    setActiveBaseId(undefined);
    setEditingBase(false);
    setSelectedDocument(undefined);
    setDocumentChunks([]);
    setRetrievalResults([]);
    setRetrievalQuery("");
    setRetrievalError("");
    setUploadError("");
  };

  const beginBaseEdit = () => {
    if (!activeBase) return;
    setBaseDraftName(activeBase.name);
    setBaseDraftDescription(activeBase.description ?? "");
    setEditingBase(true);
  };

  const cancelBaseEdit = () => setEditingBase(false);

  const saveBaseDetails = async (): Promise<boolean> => {
    if (!activeBase || !baseDraftName.trim()) {
      setBaseError(t.baseNameRequired);
      return false;
    }
    setBaseSaving(true);
    setBaseError("");
    try {
      const updated = await request<Base>(
        `/admin/knowledge-bases/${activeBase.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            id: activeBase.id,
            name: baseDraftName.trim(),
            description: baseDraftDescription.trim(),
            enabled: activeBase.enabled,
          }),
        },
      );
      setBases((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditingBase(false);
      return true;
    } catch (error) {
      setBaseError(error instanceof Error ? error.message : t.createBaseFailed);
      return false;
    } finally {
      setBaseSaving(false);
    }
  };

  const updateQaSettings = (patch: Partial<QASceneSettings>) => {
    if (!activeBaseId) return;
    setQaSettings((current) => ({
      ...current,
      [activeBaseId]: { ...activeQaSettings, ...patch },
    }));
    setQaSaved(false);
  };

  const saveQaSettings = () => {
    localStorage.setItem("admin-qa-settings", JSON.stringify(qaSettings));
    setQaSaved(true);
    window.setTimeout(() => setQaSaved(false), 1800);
  };

  const saveKnowledgeSettings = async () => {
    if (editingBase && !(await saveBaseDetails())) return;
    saveQaSettings();
  };

  const saveEmbeddingConfig = async (profileId: string) => {
    if (!activeBaseId) return;
    setEmbeddingSaving(true);
    setUploadError("");
    try {
      const config = await request<EmbeddingConfig>(
        `/admin/knowledge-bases/${activeBaseId}/embedding-config`,
        {
          method: "PUT",
          body: JSON.stringify({ profileId: profileId || null }),
        },
      );
      setEmbeddingConfig(config);
      setEmbeddingValidation(undefined);
      setBases((items) =>
        items.map((item) =>
          item.id === activeBaseId
            ? { ...item, embeddingProfileId: profileId || undefined }
            : item,
        ),
      );
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Embedding 配置保存失败",
      );
    } finally {
      setEmbeddingSaving(false);
    }
  };

  const validateEmbeddingConfig = async () => {
    if (!activeBaseId) return;
    setEmbeddingSaving(true);
    setUploadError("");
    try {
      setEmbeddingValidation(
        await request<EmbeddingValidation>(
          `/admin/knowledge-bases/${activeBaseId}/embedding-config/validate`,
          { method: "POST" },
        ),
      );
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Embedding 配置检测失败",
      );
    } finally {
      setEmbeddingSaving(false);
    }
  };

  const runKnowledgeDiagnostics = async () => {
    if (!activeBaseId) return;
    setEmbeddingSaving(true);
    try {
      setKnowledgeDiagnostics(
        await request<KnowledgeDiagnostics>(
          `/admin/knowledge-bases/${activeBaseId}/diagnostics`,
        ),
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "知识库诊断失败");
    } finally {
      setEmbeddingSaving(false);
    }
  };

  const addAgent = (role = "DOMAIN") => {
    const preset =
      AGENT_PRESETS[language][role] ?? AGENT_PRESETS[language].DOMAIN;
    setAgentConfigId(undefined);
    setEditingAgentId(undefined);
    setAgentId(preset.id);
    setAgentDisplayName(preset.displayName);
    setAgentDescription("");
    setAgentSystemPrompt(preset.systemPrompt);
    setAgentBrowserActions(false);
    setAgentEnabled(true);
    setAgentPriority(100);
    setAgentRoutingRules("");
    setAgentRole(role);
    setAgentParentId(
      role === "SUB"
        ? agents.find((item) => item.role === "DOMAIN" && item.enabled)?.id ??
            ""
        : "",
    );
    setAgentHandlingMode("AUTO");
    setAgentReturnMode("CHILD_DIRECT");
    setAgentChildIds([]);
    setAgentChildRules({});
    setAgentChildSearch("");
    setAgentVersions([]);
    setAgentModel("");
    setAgentTemperature("");
    setAgentKnowledgeBaseIds("");
    setAgentToolIds([]);
    setAgentSkillIds([]);
    setAgentKnowledgeSearch("");
    setAgentToolSearch("");
    setAgentSkillSearch("");
    setAgentError("");
    setAgentDialogOpen(true);
  };

  const openAgentSettings = (agent: Agent) => {
    setAgentConfigDirty(false);
    setAgentReturnTab(
      ["agents-general", "agents-domain", "agents-sub"].includes(tab)
        ? tab
        : "agents",
    );
    setAgentConfigId(agent.id);
    setTab("agent-settings");
    setAgentConfigSection("basic");
    setEditingAgentId(agent.id);
    setAgentId(agent.id);
    setAgentDisplayName(agent.displayName);
    setAgentDescription(agent.description ?? "");
    setAgentSystemPrompt(agent.systemPrompt ?? "");
    setAgentBrowserActions(Boolean(agent.supportsBrowserActions));
    setAgentEnabled(agent.enabled);
    setAgentPriority(agent.priority ?? 100);
    setAgentRoutingRules(agent.routingRules ?? "");
    setAgentRole(agent.role ?? (agent.systemAgent ? "MAIN" : "DOMAIN"));
    setAgentParentId(agent.parentAgentId ?? "");
    setAgentHandlingMode(agent.handlingMode ?? "AUTO");
    setAgentReturnMode(agent.returnMode ?? "CHILD_DIRECT");
    setAgentChildSearch("");
    setAgentChildIds([]);
    setAgentChildRules({});
    request<AgentChildBinding[]>(`/admin/agents/${agent.id}/children`)
      .then((items) => {
        setAgentChildIds(items.map((item) => item.childAgentId));
        setAgentChildRules(
          Object.fromEntries(
            items.map((item) => [item.childAgentId, item.routingRule ?? ""]),
          ),
        );
      })
      .catch(() => {
        setAgentChildIds([]);
        setAgentChildRules({});
      });
    request<AgentConfigVersion[]>(`/admin/agents/${agent.id}/versions`)
      .then(setAgentVersions)
      .catch(() => setAgentVersions([]));
    setAgentModel(agent.model ?? "");
    setAgentTemperature(
      agent.temperature === undefined || agent.temperature === null
        ? ""
        : String(agent.temperature),
    );
    setAgentKnowledgeBaseIds(agent.knowledgeBaseIds ?? "");
    setAgentToolIds(parseIds(agent.toolIds));
    setAgentSkillIds(parseIds(agent.skillIds));
    setAgentKnowledgeSearch("");
    setAgentToolSearch("");
    setAgentSkillSearch("");
    setAgentError("");
    setAgentDialogOpen(false);
  };

  const closeAgentConfig = () => {
    const performClose = () => {
      setAgentConfigDirty(false);
      setAgentConfigId(undefined);
      setTab(agentReturnTab);
    };
    if (agentConfigDirty && agentConfigId) {
      askConfirm({
        title: t.unsavedChangesTitle,
        description: t.unsavedChangesDesc,
        confirmLabel: t.discardChanges,
        cancelLabel: t.stayHere,
        tone: "primary",
        onConfirm: () => {
          performClose();
        },
      });
      return;
    }
    performClose();
  };

  const requestAgentConfigSection = (
    key: typeof agentConfigSection,
  ) => {
    if (agentConfigSection === key) return;
    if (!agentConfigDirty) {
      setAgentConfigSection(key);
      return;
    }
    askConfirm({
      title: t.unsavedChangesTitle,
      description: t.unsavedTabChangeDesc,
      confirmLabel: t.discardChanges,
      cancelLabel: t.stayHere,
      tone: "primary",
      onConfirm: () => {
        setAgentConfigDirty(false);
        setAgentConfigSection(key);
      },
    });
  };

  const closeAgentDialog = () => {
    if (!agentSubmitting) setAgentDialogOpen(false);
  };

  const openAgentTest = (agent: Agent) => {
    setTestingAgent(agent);
    setAgentTestMessage("");
    setAgentTestContext("");
    setAgentTestResult("");
    setAgentTestError("");
    setAgentTestDialogOpen(true);
  };

  const closeAgentTest = () => {
    if (!agentTestSubmitting) setAgentTestDialogOpen(false);
  };

  const runAgentTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!testingAgent || !agentTestMessage.trim()) return;
    setAgentTestSubmitting(true);
    setAgentTestError("");
    setAgentTestResult("");
    try {
      const result = await request<{ response: string }>(
        `/admin/agents/${testingAgent.id}/test`,
        {
          method: "POST",
          body: JSON.stringify({
            message: agentTestMessage.trim(),
            pageContext: agentTestContext.trim() || null,
          }),
        },
      );
      setAgentTestResult(result.response);
    } catch (error) {
      setAgentTestError(error instanceof Error ? error.message : t.testFailed);
    } finally {
      setAgentTestSubmitting(false);
    }
  };

  const saveAgent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = agentId.trim();
    const displayName = agentDisplayName.trim();
    const systemPrompt = agentSystemPrompt.trim();
    if (editingAgentId && !/^[a-z0-9][a-z0-9-]{1,127}$/.test(id)) {
      setAgentError(t.agentIdInvalid);
      return;
    }
    if (!displayName) {
      setAgentError(t.agentNameRequired);
      return;
    }
    if (!systemPrompt) {
      setAgentError(t.promptRequired);
      return;
    }
    if (
      agentRole === "SUB" &&
      (!agentParentId.trim() ||
        !agents.some(
          (item) =>
            item.id === agentParentId.trim() &&
            item.role === "DOMAIN" &&
            item.enabled,
        ))
    ) {
      setAgentError(t.parentAgentRequired);
      return;
    }

    setAgentSubmitting(true);
    setAgentError("");
    try {
      const savedAgent = await request<Agent>(
        editingAgentId ? `/admin/agents/${editingAgentId}` : "/admin/agents",
        {
          method: editingAgentId ? "PUT" : "POST",
          body: JSON.stringify({
            id: editingAgentId ? id : null,
            displayName,
            description: agentDescription.trim(),
            systemPrompt,
            role: agentRole,
            parentAgentId: agentParentId.trim() || null,
            handlingMode: agentHandlingMode,
            returnMode: agentReturnMode,
            enabled: agentEnabled,
            priority: Math.max(0, Math.min(10000, Number(agentPriority) || 0)),
            routingRules: agentRoutingRules.trim() || null,
            supportsBrowserActions: agentBrowserActions,
            model: agentModel.trim() || null,
            temperature: agentTemperature.trim()
              ? Number(agentTemperature)
              : null,
            knowledgeBaseIds: agentKnowledgeBaseIds.trim(),
            toolIds: JSON.stringify(agentToolIds),
            skillIds: JSON.stringify(agentSkillIds),
          }),
        },
      );
      if (agentRole === "DOMAIN" && savedAgent?.id) {
        await request(`/admin/agents/${savedAgent.id}/children`, {
          method: "PUT",
          body: JSON.stringify(
            agentChildIds.map((childAgentId, index) => ({
              childAgentId,
              priority: index * 10,
              enabled: true,
              routingRule: agentChildRules[childAgentId]?.trim() || null,
            })),
          ),
        });
      }
      setAgentConfigDirty(false);
      setAgentDialogOpen(false);
      loadAgents();
    } catch (error) {
      setAgentError(
        error instanceof Error ? error.message : t.createAgentFailed,
      );
    } finally {
      setAgentSubmitting(false);
    }
  };

  const publishAgent = async () => {
    if (!configuredAgent) return;
    setAgentSubmitting(true);
    setAgentError("");
    try {
      await request(`/admin/agents/${configuredAgent.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ releaseNote: "后台配置发布" }),
      });
      loadAgents();
      setAgentVersions(
        await request<AgentConfigVersion[]>(
          `/admin/agents/${configuredAgent.id}/versions`,
        ),
      );
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : t.saveAgent);
    } finally {
      setAgentSubmitting(false);
    }
  };

  const rollbackAgent = async (version: number) => {
    if (!configuredAgent) return;
    setAgentSubmitting(true);
    try {
      await request(`/admin/agents/${configuredAgent.id}/rollback`, {
        method: "POST",
        body: JSON.stringify({ version }),
      });
      loadAgents();
      setAgentVersions(
        await request<AgentConfigVersion[]>(
          `/admin/agents/${configuredAgent.id}/versions`,
        ),
      );
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : t.saveAgent);
    } finally {
      setAgentSubmitting(false);
    }
  };

  const toggle = async (agent: Agent) => {
    const enabled = !agent.enabled;
    await request(`/admin/agents/${agent.id}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    if (agentConfigId === agent.id) setAgentEnabled(enabled);
    loadAgents();
  };

  const deleteAgent = async (agent: Agent) => {
    if (
      agent.systemAgent ||
      ["assistant", "route-copilot"].includes(agent.id)
    ) {
      return;
    }
    if (agent.enabled) {
      toast.warning(t.deleteAgentEnabled);
      return;
    }
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.deleteAgentConfirm(agent.displayName),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setAgentActionId(agent.id);
        try {
          await request(`/admin/agents/${agent.id}`, { method: "DELETE" });
          setAgents((current) =>
            current.filter((item) => item.id !== agent.id),
          );
          if (agentConfigId === agent.id) closeAgentConfig();
          toast.success(t.agentDeleted(agent.displayName));
        } catch (error) {
          setAgentError(
            error instanceof Error ? error.message : t.deleteAgentFailed,
          );
          throw error;
        } finally {
          setAgentActionId(undefined);
        }
      },
    });
  };

  const isSystemAgent = (agent: Agent) =>
    agent.systemAgent === true ||
    ["assistant", "route-copilot"].includes(agent.id);

  const agentRoleOf = (agent: Agent) =>
    agent.role ?? (agent.systemAgent ? "MAIN" : "DOMAIN");

  const addBase = () => {
    setBaseName("");
    setBaseDescription("");
    setBaseError("");
    setBaseDialogOpen(true);
  };

  const closeBaseDialog = () => {
    if (!baseSubmitting) setBaseDialogOpen(false);
  };

  const createBase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = baseName.trim();
    if (!name) {
      setBaseError(t.baseNameRequired);
      return;
    }
    if (
      bases.some((item) => normalizedName(item.name) === normalizedName(name))
    ) {
      setBaseError(t.nameExists);
      return;
    }

    setBaseSubmitting(true);
    setBaseError("");
    try {
      await request("/admin/knowledge-bases", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: baseDescription.trim(),
          enabled: true,
        }),
      });
      setBaseDialogOpen(false);
      loadBases();
    } catch (error) {
      setBaseError(error instanceof Error ? error.message : t.createBaseFailed);
    } finally {
      setBaseSubmitting(false);
    }
  };

  const uploadDocument = async (baseId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      `${API}/admin/knowledge-bases/${baseId}/documents`,
      {
        method: "POST",
        body: formData,
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `上传失败（${response.status}）`);
    }
    return (await response.json()) as KnowledgeDocument;
  };

  const uploadDocuments = async (
    baseId: string,
    files: FileList | null,
    input: HTMLInputElement,
  ) => {
    const selectedFiles = files ? Array.from(files) : [];
    input.value = "";
    if (!selectedFiles.length) return;
    setUploadingBaseId(baseId);
    setUploadError("");
    setUploadProgress({ current: 0, total: selectedFiles.length });
    try {
      for (const [index, file] of selectedFiles.entries()) {
        const document = await uploadDocument(baseId, file);
        setDocuments((current) => ({
          ...current,
          [baseId]: [
            document,
            ...(current[baseId] ?? []).filter(
              (item) => item.id !== document.id,
            ),
          ],
        }));
        setUploadProgress({ current: index + 1, total: selectedFiles.length });
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.uploadFailed);
    } finally {
      setUploadingBaseId(undefined);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const reindexDocument = async (document: KnowledgeDocument) => {
    setDocumentActionId(document.id);
    setUploadError("");
    try {
      const updated = await request<KnowledgeDocument>(
        `/admin/knowledge-bases/documents/${document.id}/reindex`,
        { method: "POST" },
      );
      setDocuments((current) => ({
        ...current,
        [document.knowledgeBaseId]: (
          current[document.knowledgeBaseId] ?? []
        ).map((item) => (item.id === document.id ? updated : item)),
      }));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.reindexFailed);
    } finally {
      setDocumentActionId(undefined);
    }
  };

  const deleteDocument = async (document: KnowledgeDocument) => {
    askConfirm({
      title: t.confirmDeleteTitle,
      description: t.deleteConfirm(document.filename),
      confirmLabel: t.deleteResource,
      cancelLabel: t.cancelLabel,
      tone: "danger",
      onConfirm: async () => {
        setDocumentActionId(document.id);
        setUploadError("");
        try {
          await request(`/admin/knowledge-bases/documents/${document.id}`, {
            method: "DELETE",
          });
          setDocuments((current) => ({
            ...current,
            [document.knowledgeBaseId]: (
              current[document.knowledgeBaseId] ?? []
            ).filter((item) => item.id !== document.id),
          }));
          toast.success(t.documentDeleted(document.filename));
        } catch (error) {
          setUploadError(error instanceof Error ? error.message : t.deleteFailed);
          throw error;
        } finally {
          setDocumentActionId(undefined);
        }
      },
    });
  };

  const openDocumentDetails = async (document: KnowledgeDocument) => {
    if (!activeBaseId) return;
    setSelectedDocument(document);
    setDocumentChunks([]);
    setChunksLoading(true);
    try {
      const result = await request<DocumentChunk[]>(
        `/admin/knowledge-bases/${activeBaseId}/documents/${document.id}/chunks`,
      );
      setDocumentChunks(result);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t.uploadFailed);
    } finally {
      setChunksLoading(false);
    }
  };

  const runRetrieval = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeBaseId || !retrievalQuery.trim()) return;
    setRetrievalLoading(true);
    setRetrievalError("");
    try {
      const result = await request<RetrievalResult[]>(
        `/admin/knowledge-bases/${activeBaseId}/search`,
        {
          method: "POST",
          body: JSON.stringify({
            query: retrievalQuery.trim(),
            topK: activeQaSettings.topK,
          }),
        },
      );
      setRetrievalResults(result);
    } catch (error) {
      setRetrievalError(
        error instanceof Error ? error.message : t.retrievalFailed,
      );
    } finally {
      setRetrievalLoading(false);
    }
  };

  const documentStatus = (
    status: KnowledgeDocument["status"],
    labels: (typeof translations)[Language],
  ) => {
    if (status === "READY") return labels.parsed;
    if (status === "INDEXING" || status === "PARSING") return labels.processing;
    if (status === "ERROR") return labels.parseFailed;
    return labels.pending;
  };

  const testRoute = async () => {
    if (!message.trim()) return;
    setRouteAnalysis("");
    setRoute(
      await request<Record<string, unknown>>("/admin/router/test", {
        method: "POST",
        body: JSON.stringify({
          message: message.trim(),
          pageContext: routePageContext.trim(),
        }),
      }),
    );
  };

  const analyzeRoute = async () => {
    if (!route || !message.trim()) return;
    setRouteAnalyzing(true);
    setRouteAnalysis("");
    try {
      const result = await request<{ analysis: string }>(
        "/admin/router/analyze",
        {
          method: "POST",
          body: JSON.stringify({
            message: message.trim(),
            pageContext: routePageContext.trim(),
            route,
          }),
        },
      );
      setRouteAnalysis(result.analysis);
    } catch {
      setRouteAnalysis(t.routeAnalysisFailed);
    } finally {
      setRouteAnalyzing(false);
    }
  };

  const configuredAgent = agents.find((item) => item.id === agentConfigId);
  const configuredAgentIsSystem = configuredAgent
    ? isSystemAgent(configuredAgent)
    : true;
  const promptError =
    agentError || agentTestError || baseError || uploadError || resourceError;
  const dismissPromptError = () => {
    setAgentError("");
    setAgentTestError("");
    setBaseError("");
    setUploadError("");
    setResourceError("");
  };
  const matchesSearch = (..._values: unknown[]) => true;
  const filteredAgents = agents.filter((agent) =>
    matchesSearch(agent.displayName, agent.id, agent.description),
  );
  const filteredBases = bases.filter((base) =>
    matchesSearch(base.name, base.id, base.description),
  );
  const activeDocuments = activeBaseId ? (documents[activeBaseId] ?? []) : [];
  const filteredDocuments = activeDocuments.filter((document) =>
    matchesSearch(document.filename, document.id, document.status),
  );
  const filteredTools = tools.filter(
    (tool) =>
      (resourceStatus === "all" ||
        (resourceStatus === "enabled" ? tool.enabled : !tool.enabled)) &&
      matchesSearch(
        tool.name,
        tool.id,
        tool.description,
        tool.type,
        tool.endpoint,
        tool.mcpServerUrl,
      ),
  );
  const filteredMcpServers = mcpServers;
  const filteredSkills = skills.filter(
    (skill) =>
      (resourceStatus === "all" ||
        (resourceStatus === "enabled" ? skill.enabled : !skill.enabled)) &&
      matchesSearch(skill.name, skill.id, skill.description, skill.prompt),
  );
  const filteredHooks = hooks.filter((hook) =>
    matchesSearch(
      hook.name,
      hook.id,
      hook.description,
      hook.ruleType,
      hook.ruleConfig,
    ),
  );
  const filteredFeedback = feedback.filter((item) =>
    matchesSearch(
      item.agentId,
      item.sessionId,
      item.messageId,
      item.rating,
      item.comment,
    ),
  );
  const agentListTab = (() => {
    const config = {
      agents: { role: "MAIN", title: t.roleMain, hint: t.systemAgentPageHint },
      "agents-general": {
        role: "GENERAL",
        title: t.generalAgentPage,
        hint: t.generalAgentPageHint,
      },
      "agents-domain": {
        role: "DOMAIN",
        title: t.domainAgentPage,
        hint: t.domainAgentPageHint,
      },
      "agents-sub": {
        role: "SUB",
        title: t.subAgentPage,
        hint: t.subAgentPageHint,
      },
    }[tab];
    if (!config) return undefined;
    return {
      ...config,
      items: filteredAgents.filter((agent) =>
        agentRoleOf(agent) === config.role,
      ),
    };
  })();

  return (
    <div className="shell">
      <ToastContainer />
      <aside className={sidebarCollapsed ? "sidebar-collapsed" : undefined}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <h1>{t.title}</h1>
            {!sidebarCollapsed && <p className="muted">{t.subtitle}</p>}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
            title={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>
        <div className="nav-group">
          <div className="nav-row">
            <button
              className={tab === "agents" ? "nav active" : "nav"}
              onClick={() => {
                if (tab === "agents") {
                  setAgentMenuOpen((open) => !open);
                } else {
                  setTab("agents");
                  setAgentMenuOpen(true);
                }
              }}
              title={sidebarCollapsed ? t.agents : undefined}
              aria-label={t.agents}
            >
              <span className="nav-icon" aria-hidden="true">
                ◆
              </span>
              {!sidebarCollapsed && <span>{t.agents}</span>}
            </button>
            {!sidebarCollapsed && (
              <button
                className="nav-caret"
                onClick={() => setAgentMenuOpen((open) => !open)}
                aria-expanded={agentMenuOpen}
                aria-label={t.agentRole}
                title={t.agentRole}
              >
                {agentMenuOpen ? "▾" : "▸"}
              </button>
            )}
          </div>
          {!sidebarCollapsed && agentMenuOpen && (
            <div className="nav-sub">
              {(
                [
                  ["agents-general", t.generalAgentPage],
                  ["agents-domain", t.domainAgentPage],
                  ["agents-sub", t.subAgentPage],
                ] as const
              ).map(([key, label]) => (
                <button
                  className={
                    tab === key ? "nav nav-sub-item active" : "nav nav-sub-item"
                  }
                  onClick={() => setTab(key)}
                  aria-label={label}
                  key={key}
                >
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {[
          ["knowledge", "▣"],
          ["mcp-servers", "⌘"],
          ["tools", "⚒"],
          ["skills", "✦"],
          ["hooks", "⚑"],
          ["ratings", "★"],
          ["conversation-logs", "☷"],
          ["router", "⌁"],
        ].map(([key, icon]) => {
          const labels: Record<string, string> = {
            knowledge: t.knowledge,
            "mcp-servers": t.mcpServers,
            tools: t.toolsMenu,
            skills: t.skillsMenu,
            hooks: t.hooksMenu,
            ratings: t.agentRatings,
            "conversation-logs": t.conversationLogs,
            router: t.router,
          };
          return (
            <button
              className={tab === key ? "nav active" : "nav"}
              onClick={() => setTab(key)}
              title={sidebarCollapsed ? labels[key] : undefined}
              aria-label={labels[key]}
              key={key}
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              {!sidebarCollapsed && <span>{labels[key]}</span>}
            </button>
          );
        })}
      </aside>

      <main>
        <header>
          <h2>
            {tab === "agents"
              ? t.agentConfig
              : tab === "agents-general"
                ? t.generalAgentPage
                : tab === "agents-domain"
                  ? t.domainAgentPage
                  : tab === "agents-sub"
                    ? t.subAgentPage
                    : tab === "agent-settings"
                      ? t.agentSettingsPage
                      : tab === "knowledge"
                        ? t.knowledge
                        : tab === "mcp-servers"
                          ? t.mcpServersTitle
                          : tab === "tools"
                            ? t.toolsTitle
                            : tab === "skills"
                              ? t.skillsTitle
                              : tab === "hooks"
                                ? t.hooksTitle
                                : tab === "ratings"
                                  ? t.agentRatings
                                  : tab === "conversation-logs"
                                    ? t.conversationLogs
                                    : t.routerTest}
          </h2>
          <div className="header-actions">
            <span className="badge">{t.localMode}</span>
            <button
              className="settings-button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label={t.settings}
              title={t.settings}
            >
              ⚙
            </button>
            {settingsOpen && (
              <div
                className="settings-popover"
                role="dialog"
                aria-label={t.settings}
              >
                <strong>{t.settings}</strong>
                <span className="settings-label">{t.language}</span>
                <div className="settings-options">
                  <button
                    className={language === "zh" ? "option active" : "option"}
                    onClick={() => setLanguage("zh")}
                  >
                    {t.chinese}
                  </button>
                  <button
                    className={language === "en" ? "option active" : "option"}
                    onClick={() => setLanguage("en")}
                  >
                    {t.english}
                  </button>
                </div>
                <span className="settings-label">{t.appearance}</span>
                <div className="settings-options">
                  <button
                    className={theme === "dark" ? "option active" : "option"}
                    onClick={() => setTheme("dark")}
                  >
                    {t.dark}
                  </button>
                  <button
                    className={theme === "light" ? "option active" : "option"}
                    onClick={() => setTheme("light")}
                  >
                    {t.light}
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {tab === "agent-settings" && agentConfigId && (
          <section className="agent-settings-page">
            <div className="detail-header agent-settings-header">
              <button className="back-button" onClick={closeAgentConfig}>
                {t.backToAgents}
              </button>
              <div>
                <h3>{agentDisplayName || agentId}</h3>
                <p>{t.editAgentSubtitle}</p>
              </div>
              <div className="agent-settings-header-actions">
                {configuredAgent && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => toggle(configuredAgent)}
                    disabled={agentActionId === configuredAgent.id}
                  >
                    {agentEnabled ? t.stop : t.enable}
                  </button>
                )}
                <button
                  type="button"
                  className="agent-test"
                  onClick={() => {
                    if (configuredAgent) openAgentTest(configuredAgent);
                  }}
                  disabled={!agentEnabled || !configuredAgent}
                >
                  {t.testAgent}
                </button>
                {!configuredAgentIsSystem && configuredAgent && (
                  <button
                    type="button"
                    className="agent-delete"
                    onClick={() => deleteAgent(configuredAgent)}
                    disabled={
                      configuredAgent.enabled ||
                      agentActionId === configuredAgent.id
                    }
                    title={
                      configuredAgent.enabled
                        ? t.deleteAgentDisabledHint
                        : t.deleteAgent
                    }
                  >
                    {t.deleteAgent}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAgentConfig}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  form="agent-settings-form"
                  disabled={agentSubmitting}
                >
                  {agentSubmitting ? t.saving : t.saveAgent}
                </button>
              </div>
            </div>
            <div className="config-tabs">
              {(
                [
                  ["basic", t.basicInfo],
                  ...(agentRole === "MAIN"
                    ? ([["routing", t.intentRouting]] as const)
                    : []),
                  ...(agentRole === "DOMAIN"
                    ? ([
                        ["strategy", t.handlingMode],
                        ["children", t.childBinding],
                      ] as const)
                    : []),
                  ["knowledge", t.knowledgeBinding],
                  ["tools", t.tools],
                  ["skills", t.skills],
                  ["versions", t.versions],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={agentConfigSection === key ? "active" : undefined}
                  onClick={() => requestAgentConfigSection(key)}
                >
                  {label}
                  {agentConfigSection !== key && agentConfigDirty && (
                    <span className="config-tab-dirty" aria-label={t.unsavedChangesTitle} />
                  )}
                </button>
              ))}
            </div>
            <form
              id="agent-settings-form"
              className="agent-settings-form"
              onSubmit={saveAgent}
            >
              {agentConfigSection === "basic" && (
                <div className="settings-panel">
                  <label className="field">
                    <span>{t.agentId}</span>
                    <input value={agentId} disabled />
                    <small className="field-hint">{t.agentIdHint}</small>
                  </label>
                  <div className="field-grid">
                    <label className="field">
                      <span>{t.agentRole}</span>
                      <select
                        value={agentRole}
                        onChange={(event) => setAgentRole(event.target.value)}
                        disabled={configuredAgentIsSystem}
                      >
                        <option value="GENERAL">{t.roleGeneral}</option>
                        <option value="DOMAIN">{t.roleDomain}</option>
                        <option value="SUB">{t.roleSub}</option>
                        {configuredAgentIsSystem && (
                          <option value="MAIN">{t.roleMain}</option>
                        )}
                      </select>
                    </label>
                    {agentRole === "SUB" && (
                      <label className="field">
                        <span>{t.parentAgent}</span>
                        <select
                          value={agentParentId}
                          onChange={(event) =>
                            setAgentParentId(event.target.value)
                          }
                        >
                          <option value="">—</option>
                          {agents
                            .filter(
                              (item) => item.role === "DOMAIN" && item.enabled,
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.displayName}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="field">
                    <span>{t.displayName}</span>
                    <input
                      value={agentDisplayName}
                      onChange={(event) =>
                        setAgentDisplayName(event.target.value)
                      }
                      maxLength={100}
                    />
                  </label>
                  <label className="field">
                    <span>{t.descriptionOptional}</span>
                    <textarea
                      value={agentDescription}
                      onChange={(event) =>
                        setAgentDescription(event.target.value)
                      }
                      rows={3}
                      maxLength={500}
                    />
                  </label>
                  <label className="field">
                    <span>{t.systemPrompt}</span>
                    <textarea
                      value={agentSystemPrompt}
                      onChange={(event) =>
                        setAgentSystemPrompt(event.target.value)
                      }
                      rows={7}
                      maxLength={8000}
                    />
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={agentBrowserActions}
                      onChange={(event) =>
                        setAgentBrowserActions(event.target.checked)
                      }
                    />
                    <span>{t.browserActions}</span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={agentEnabled}
                      onChange={(event) =>
                        setAgentEnabled(event.target.checked)
                      }
                    />
                    <span>{t.enabled}</span>
                  </label>
                  <div className="field-grid">
                    <label className="field">
                      <span>{t.priority}</span>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={agentPriority}
                        onChange={(event) =>
                          setAgentPriority(Number(event.target.value) || 0)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>{t.temperature}</span>
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={agentTemperature}
                        onChange={(event) =>
                          setAgentTemperature(event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>{t.model}</span>
                    <input
                      value={agentModel}
                      onChange={(event) => setAgentModel(event.target.value)}
                      placeholder={t.modelPlaceholder}
                    />
                  </label>
                </div>
              )}
              {agentConfigSection === "routing" && agentRole === "MAIN" && (
                <div className="settings-panel routing-panel">
                  <div className="binding-heading">
                    <div>
                      <h4>{t.intentRouting}</h4>
                      <p>{t.intentRoutingHint}</p>
                    </div>
                    <span className="route-badge">系统 Agent</span>
                  </div>
                  <label className="field">
                    <span>{t.routingRules}</span>
                    <textarea
                      value={agentRoutingRules}
                      onChange={(event) =>
                        setAgentRoutingRules(event.target.value)
                      }
                      placeholder={t.routingRulesPlaceholder}
                      rows={12}
                      maxLength={8000}
                    />
                    <small className="field-hint">{t.idsHint}</small>
                  </label>
                  <div className="routing-priority-note">
                    <strong>{t.priority}</strong>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={agentPriority}
                      onChange={(event) =>
                        setAgentPriority(Number(event.target.value) || 0)
                      }
                      aria-label={t.priority}
                    />
                    <small>{t.intentRoutingHint}</small>
                  </div>
                </div>
              )}
              {agentConfigSection === "strategy" && agentRole === "DOMAIN" && (
                <div className="settings-panel">
                  <div className="binding-heading">
                    <div>
                      <h4>{t.handlingMode}</h4>
                      <p>{t.intentRoutingHint}</p>
                    </div>
                  </div>
                  <label className="field">
                    <span>{t.handlingMode}</span>
                    <select
                      value={agentHandlingMode}
                      onChange={(event) =>
                        setAgentHandlingMode(event.target.value)
                      }
                    >
                      <option value="DIRECT">{t.directMode}</option>
                      <option value="DELEGATE">{t.delegateMode}</option>
                      <option value="AUTO">{t.autoMode}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>{t.returnMode}</span>
                    <select
                      value={agentReturnMode}
                      onChange={(event) =>
                        setAgentReturnMode(event.target.value)
                      }
                    >
                      <option value="CHILD_DIRECT">{t.childDirectMode}</option>
                      <option value="DOMAIN_SUMMARY">
                        {t.domainSummaryMode}
                      </option>
                    </select>
                  </label>
                </div>
              )}
              {agentConfigSection === "children" && agentRole === "DOMAIN" && (
                <div className="settings-panel">
                  <div className="binding-heading">
                    <div>
                      <h4>{t.childBinding}</h4>
                      <p>{t.childRoutingRuleHint}</p>
                    </div>
                    <span className="binding-count">
                      {agentChildIds.length}
                    </span>
                  </div>
                  <label className="binding-search">
                    <span className="sr-only">{t.search}</span>
                    <input
                      type="search"
                      value={agentChildSearch}
                      onChange={(event) =>
                        setAgentChildSearch(event.target.value)
                      }
                      placeholder={t.searchPlaceholder}
                    />
                  </label>
                  <div className="binding-list binding-list-tall">
                    {agents
                      .filter((item) => item.role === "SUB" && item.enabled)
                      .filter((item) => {
                        const query = agentChildSearch.trim().toLowerCase();
                        return (
                          !query ||
                          [
                            item.id,
                            item.displayName,
                            item.description ?? "",
                          ].some((value) => value.toLowerCase().includes(query))
                        );
                      })
                      .map((item) => {
                        const checked = agentChildIds.includes(item.id);
                        return (
                          <div className="child-binding" key={item.id}>
                            <label className="binding-option">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setAgentChildIds((current) =>
                                    checked
                                      ? current.filter((id) => id !== item.id)
                                      : [...current, item.id],
                                  );
                                  if (checked)
                                    setAgentChildRules((current) => {
                                      const next = { ...current };
                                      delete next[item.id];
                                      return next;
                                    });
                                }}
                              />
                              <span className="binding-copy">
                                <span className="binding-name">
                                  {item.displayName}
                                </span>
                                <span className="binding-meta">{item.id}</span>
                                {item.description && (
                                  <span className="binding-description">
                                    {item.description}
                                  </span>
                                )}
                              </span>
                            </label>
                            {checked && (
                              <label className="child-rule">
                                <span>{t.childRoutingRule}</span>
                                <input
                                  value={agentChildRules[item.id] ?? ""}
                                  onChange={(event) =>
                                    setAgentChildRules((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                  placeholder={t.childRoutingRulePlaceholder}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {agents.filter((item) => item.role === "SUB" && item.enabled)
                    .length === 0 && (
                    <p className="binding-empty">{t.noChildAgents}</p>
                  )}
                </div>
              )}
              {agentConfigSection === "knowledge" && (
                <div className="settings-panel">
                  <div className="binding-heading">
                    <div>
                      <h4>{t.knowledgeBases}</h4>
                      <p>{t.idsHint}</p>
                    </div>
                    <span className="binding-count">
                      {parseIds(agentKnowledgeBaseIds).length}
                    </span>
                  </div>
                  {bases.length === 0 ? (
                    <p className="binding-empty">{t.noKnowledgeBases}</p>
                  ) : (
                    <>
                      <label className="binding-search">
                        <span className="sr-only">{t.search}</span>
                        <input
                          value={agentKnowledgeSearch}
                          onChange={(event) =>
                            setAgentKnowledgeSearch(event.target.value)
                          }
                          placeholder={t.searchPlaceholder}
                          type="search"
                        />
                      </label>
                      {bases.filter((base) => {
                        const query = agentKnowledgeSearch.trim().toLowerCase();
                        if (!query) return true;
                        return [
                          base.id,
                          base.name,
                          base.description ?? "",
                        ].some((value) => value.toLowerCase().includes(query));
                      }).length === 0 ? (
                        <p className="binding-empty">{t.noSearchResults}</p>
                      ) : (
                        <div className="binding-list">
                          {bases
                            .filter((base) => {
                              const query = agentKnowledgeSearch
                                .trim()
                                .toLowerCase();
                              if (!query) return true;
                              return [
                                base.id,
                                base.name,
                                base.description ?? "",
                              ].some((value) =>
                                value.toLowerCase().includes(query),
                              );
                            })
                            .map((base) => {
                              const selected = parseIds(
                                agentKnowledgeBaseIds,
                              ).includes(base.id);
                              return (
                                <label className="binding-option" key={base.id}>
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => {
                                      const current = parseIds(
                                        agentKnowledgeBaseIds,
                                      );
                                      const next = selected
                                        ? current.filter((id) => id !== base.id)
                                        : [...current, base.id];
                                      setAgentKnowledgeBaseIds(
                                        JSON.stringify(next),
                                      );
                                    }}
                                  />
                                  <span className="binding-copy">
                                    <span className="binding-name">
                                      {base.name}
                                    </span>
                                    <span className="binding-meta">
                                      {base.enabled ? t.enabled : t.disabled}
                                    </span>
                                    {base.description && (
                                      <span className="binding-description">
                                        {base.description}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {(agentConfigSection === "tools" ||
                agentConfigSection === "skills") && (
                <div className="settings-panel">
                  {agentConfigSection === "tools" && (
                    <section className="binding-section">
                      <div className="binding-heading">
                        <div>
                          <h4>{t.tools}</h4>
                          <p>{t.browserActions}</p>
                        </div>
                        <span className="binding-count">
                          {agentToolIds.length}
                        </span>
                      </div>
                      {tools.filter((tool) => tool.enabled).length === 0 ? (
                        <p className="binding-empty">{t.noTools}</p>
                      ) : (
                        <>
                          <label className="binding-search">
                            <span className="sr-only">{t.search}</span>
                            <input
                              value={agentToolSearch}
                              onChange={(event) =>
                                setAgentToolSearch(event.target.value)
                              }
                              placeholder={t.searchPlaceholder}
                              type="search"
                            />
                          </label>
                          {tools.filter((tool) => {
                            if (!tool.enabled) return false;
                            const query = agentToolSearch.trim().toLowerCase();
                            if (!query) return true;
                            return [
                              tool.id,
                              tool.name,
                              tool.description ?? "",
                              tool.type ?? "",
                              tool.endpoint ?? "",
                            ].some((value) =>
                              value.toLowerCase().includes(query),
                            );
                          }).length === 0 ? (
                            <p className="binding-empty">{t.noSearchResults}</p>
                          ) : (
                            <div className="binding-list">
                              {tools
                                .filter((tool) => {
                                  if (!tool.enabled) return false;
                                  const query = agentToolSearch
                                    .trim()
                                    .toLowerCase();
                                  if (!query) return true;
                                  return [
                                    tool.id,
                                    tool.name,
                                    tool.description ?? "",
                                    tool.type ?? "",
                                    tool.endpoint ?? "",
                                  ].some((value) =>
                                    value.toLowerCase().includes(query),
                                  );
                                })
                                .map((tool) => {
                                  const checked = agentToolIds.includes(
                                    tool.id,
                                  );
                                  return (
                                    <label
                                      className="binding-option"
                                      key={tool.id}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          setAgentToolIds((current) =>
                                            checked
                                              ? current.filter(
                                                  (id) => id !== tool.id,
                                                )
                                              : [...current, tool.id],
                                          )
                                        }
                                      />
                                      <span className="binding-copy">
                                        <span className="binding-name">
                                          {tool.name}
                                        </span>
                                        <span className="binding-meta">
                                          {tool.type === "BROWSER_PROPOSAL"
                                            ? t.browserProposal
                                            : tool.type}
                                        </span>
                                        {tool.description && (
                                          <span className="binding-description">
                                            {tool.description}
                                          </span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        className="binding-detail-button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setResourceDetails({
                                            kind: "tool",
                                            resource: tool,
                                          });
                                        }}
                                      >
                                        {t.viewDetails}
                                      </button>
                                    </label>
                                  );
                                })}
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  )}
                  {agentConfigSection === "skills" && (
                    <section className="binding-section">
                      <div className="binding-heading">
                        <div>
                          <h4>{t.skills}</h4>
                          <p>{t.idsHint}</p>
                        </div>
                        <span className="binding-count">
                          {agentSkillIds.length}
                        </span>
                      </div>
                      {skills.filter((skill) => skill.enabled).length === 0 ? (
                        <p className="binding-empty">{t.noSkills}</p>
                      ) : (
                        <>
                          <label className="binding-search">
                            <span className="sr-only">{t.search}</span>
                            <input
                              value={agentSkillSearch}
                              onChange={(event) =>
                                setAgentSkillSearch(event.target.value)
                              }
                              placeholder={t.searchPlaceholder}
                              type="search"
                            />
                          </label>
                          {skills.filter((skill) => {
                            if (!skill.enabled) return false;
                            const query = agentSkillSearch.trim().toLowerCase();
                            if (!query) return true;
                            return [
                              skill.id,
                              skill.name,
                              skill.description ?? "",
                              skill.prompt,
                              skill.version ?? "",
                            ].some((value) =>
                              value.toLowerCase().includes(query),
                            );
                          }).length === 0 ? (
                            <p className="binding-empty">{t.noSearchResults}</p>
                          ) : (
                            <div className="binding-list">
                              {skills
                                .filter((skill) => {
                                  if (!skill.enabled) return false;
                                  const query = agentSkillSearch
                                    .trim()
                                    .toLowerCase();
                                  if (!query) return true;
                                  return [
                                    skill.id,
                                    skill.name,
                                    skill.description ?? "",
                                    skill.prompt,
                                    skill.version ?? "",
                                  ].some((value) =>
                                    value.toLowerCase().includes(query),
                                  );
                                })
                                .map((skill) => {
                                  const checked = agentSkillIds.includes(
                                    skill.id,
                                  );
                                  return (
                                    <label
                                      className="binding-option"
                                      key={skill.id}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          setAgentSkillIds((current) =>
                                            checked
                                              ? current.filter(
                                                  (id) => id !== skill.id,
                                                )
                                              : [...current, skill.id],
                                          )
                                        }
                                      />
                                      <span className="binding-copy">
                                        <span className="binding-name">
                                          {skill.name}
                                        </span>
                                        {skill.version && (
                                          <span className="binding-meta">
                                            v{skill.version}
                                          </span>
                                        )}
                                        {skill.description && (
                                          <span className="binding-description">
                                            {skill.description}
                                          </span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        className="binding-detail-button"
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setResourceDetails({
                                            kind: "skill",
                                            resource: skill,
                                          });
                                        }}
                                      >
                                        {t.viewDetails}
                                      </button>
                                    </label>
                                  );
                                })}
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  )}
                </div>
              )}
              {agentConfigSection === "versions" && (
                <div className="settings-panel">
                  <div className="binding-heading">
                    <div>
                      <h4>{t.versions}</h4>
                      <p>
                        {t.publishedVersion}:{" "}
                        {configuredAgent?.publishedVersion ?? 0}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={publishAgent}
                      disabled={agentSubmitting}
                    >
                      {agentSubmitting ? t.saving : t.publish}
                    </button>
                  </div>
                  {agentVersions.length === 0 ? (
                    <p className="binding-empty">{t.draft}</p>
                  ) : (
                    <div className="version-list">
                      {agentVersions.map((version) => (
                        <div className="version-row" key={version.id}>
                          <div>
                            <strong>v{version.version}</strong>
                            <span className="binding-meta">
                              {version.status === "PUBLISHED"
                                ? t.published
                                : t.draft}
                            </span>
                            {version.releaseNote && (
                              <p>{version.releaseNote}</p>
                            )}
                          </div>
                          {version.status !== "PUBLISHED" && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => rollbackAgent(version.version)}
                              disabled={agentSubmitting}
                            >
                              {t.rollback}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>
          </section>
        )}

        {agentListTab && (
          <section>
            {agentListTab.role !== "MAIN" && (
              <button type="button" onClick={() => addAgent(agentListTab.role)}>
                {t.newAgent}
              </button>
            )}
            <section className="agent-group">
              <div className="group-heading">
                <div>
                  <h3>{agentListTab.title}</h3>
                  <p>{agentListTab.hint}</p>
                </div>
                <span className="group-count">{agentListTab.items.length}</span>
              </div>
              <div className="grid">
                {agentListTab.items.map((agent) => {
                  const parent = agent.parentAgentId
                    ? agents.find((item) => item.id === agent.parentAgentId)
                    : undefined;
                  return (
                    <article key={agent.id}>
                      <div className="row">
                        <strong>{agent.displayName}</strong>
                        <span className={agent.enabled ? "ok" : "off"}>
                          {agent.enabled ? t.enabled : t.disabled}
                        </span>
                      </div>
                      <code>{agent.id}</code>
                      {parent && (
                        <p className="agent-parent">
                          {t.parentAgent}：{parent.displayName}
                        </p>
                      )}
                      <p>{agent.description || t.noDescription}</p>
                      <div className="agent-actions">
                        <button
                          onClick={() => openAgentSettings(agent)}
                          className="secondary agent-settings-button"
                          disabled={agentActionId === agent.id}
                        >
                          {t.settings}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {agentListTab.items.length === 0 && (
                <p className="empty-documents">
                  {filteredAgents.length < agents.length
                    ? t.noSearchResults
                    : t.noAgentOfType}
                </p>
              )}
            </section>
          </section>
        )}

        {tab === "knowledge" && (
          <section>
            {!activeBase ? (
              <>
                <button onClick={addBase}>{t.newBase}</button>
                <div className="grid">
                  {filteredBases.map((base) => (
                    <article
                      className="knowledge-card knowledge-card-clickable"
                      key={base.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openKnowledgeBase(base)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openKnowledgeBase(base);
                        }
                      }}
                    >
                      <div className="row">
                        <strong>{base.name}</strong>
                        <span className={base.enabled ? "ok" : "off"}>
                          {base.enabled ? t.enabled : t.disabled}
                        </span>
                      </div>
                      <p>{base.description || t.supportedDocs}</p>
                      <code>{base.id}</code>
                      <div className="knowledge-card-footer">
                        <span className="upload-hint">
                          {t.documentCount((documents[base.id] ?? []).length)}
                        </span>
                        <button
                          className="enter-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openKnowledgeBase(base);
                          }}
                        >
                          {t.enter}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {bases.length === 0 ? (
                  <p className="empty-documents">{t.noKnowledgeBases}</p>
                ) : filteredBases.length === 0 ? (
                  <p className="empty-documents">{t.noSearchResults}</p>
                ) : null}
              </>
            ) : (
              <div className="knowledge-detail">
                <div className="detail-header">
                  <button
                    className="secondary back-button"
                    onClick={closeKnowledgeBase}
                  >
                    ← {t.back}
                  </button>
                  <div
                    className="knowledge-detail-title"
                    onDoubleClick={beginBaseEdit}
                  >
                    {editingBase ? (
                      <div className="knowledge-inline-edit">
                        <input
                          value={baseDraftName}
                          onChange={(event) =>
                            setBaseDraftName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelBaseEdit();
                          }}
                          autoFocus
                          maxLength={160}
                          aria-label={t.baseName}
                        />
                        <textarea
                          value={baseDraftDescription}
                          onChange={(event) =>
                            setBaseDraftDescription(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") cancelBaseEdit();
                          }}
                          rows={2}
                          maxLength={500}
                          aria-label={t.baseDescription}
                        />
                      </div>
                    ) : (
                      <>
                        <h3>{activeBase.name}</h3>
                        <p>{activeBase.description || t.supportedDocs}</p>
                        <small className="field-hint">
                          {t.doubleClickToEdit}
                        </small>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="qa-header-save"
                    onClick={saveKnowledgeSettings}
                    disabled={baseSaving}
                  >
                    {qaSaved ? `✓ ${t.saved}` : t.saveSettings}
                  </button>
                </div>
                <div className="detail-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={knowledgeSection === "maintenance"}
                    className={
                      knowledgeSection === "maintenance"
                        ? "detail-tab active"
                        : "detail-tab"
                    }
                    onClick={() => setKnowledgeSection("maintenance")}
                  >
                    {t.maintenance}
                  </button>
                  <button
                    role="tab"
                    aria-selected={knowledgeSection === "qa"}
                    className={
                      knowledgeSection === "qa"
                        ? "detail-tab active"
                        : "detail-tab"
                    }
                    onClick={() => setKnowledgeSection("qa")}
                  >
                    {t.qaSettings}
                  </button>
                  <button
                    role="tab"
                    aria-selected={knowledgeSection === "retrieval"}
                    className={
                      knowledgeSection === "retrieval"
                        ? "detail-tab active"
                        : "detail-tab"
                    }
                    onClick={() => setKnowledgeSection("retrieval")}
                  >
                    {t.retrievalTest}
                  </button>
                </div>
                {knowledgeSection === "maintenance" ? (
                  <div className="maintenance-panel">
                    <section
                      className="knowledge-config-panel"
                      aria-labelledby="embedding-config-title"
                    >
                      <div className="knowledge-config-heading">
                        <div>
                          <h4 id="embedding-config-title">
                            {language === "zh"
                              ? "Embedding 配置"
                              : "Embedding configuration"}
                          </h4>
                          <p>
                            {language === "zh"
                              ? "未单独配置时继承系统默认模型。保存前可调用服务验证实际维度。"
                              : "Inherit the system default unless overridden for this knowledge base."}
                          </p>
                        </div>
                        <span
                          className={
                            embeddingValidation?.reachable === false
                              ? "off"
                              : "ok"
                          }
                        >
                          {embeddingConfig?.profile?.dimension
                            ? `${embeddingConfig.profile.dimension}D`
                            : "-"}
                        </span>
                      </div>
                      <label className="field">
                        <span>
                          {language === "zh" ? "模型配置" : "Model profile"}
                        </span>
                        <select
                          value={activeBase.embeddingProfileId ?? ""}
                          disabled={embeddingSaving}
                          onChange={(event) =>
                            saveEmbeddingConfig(event.target.value)
                          }
                        >
                          <option value="">
                            {language === "zh"
                              ? "继承系统默认"
                              : "System default"}
                          </option>
                          {embeddingProfiles
                            .filter((profile) => profile.enabled)
                            .map((profile) => (
                              <option value={profile.id} key={profile.id}>
                                {profile.name} · {profile.model} ·{" "}
                                {profile.dimension}D
                              </option>
                            ))}
                        </select>
                      </label>
                      {embeddingConfig?.profile && (
                        <p className="field-hint">
                          {embeddingConfig.profile.provider} /{" "}
                          {embeddingConfig.profile.model} ·{" "}
                          {embeddingConfig.profile.dimension} dimensions
                        </p>
                      )}
                      <div className="document-actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={embeddingSaving}
                          onClick={validateEmbeddingConfig}
                        >
                          {language === "zh" ? "检测配置" : "Validate"}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={embeddingSaving}
                          onClick={runKnowledgeDiagnostics}
                        >
                          {language === "zh" ? "运行诊断" : "Diagnostics"}
                        </button>
                        {embeddingValidation && (
                          <span
                            className={
                              embeddingValidation.reachable ? "ok" : "off"
                            }
                            aria-live="polite"
                          >
                            {embeddingValidation.reachable
                              ? `${language === "zh" ? "可用" : "Reachable"} · ${embeddingValidation.actualDimension}D · ${embeddingValidation.latencyMs}ms`
                              : (embeddingValidation.error ??
                                (language === "zh" ? "不可用" : "Unavailable"))}
                          </span>
                        )}
                      </div>
                      {knowledgeDiagnostics && (
                        <p
                          className={
                            knowledgeDiagnostics.issues.length
                              ? "document-error"
                              : "field-hint"
                          }
                          aria-live="polite"
                        >
                          {knowledgeDiagnostics.issues.length
                            ? knowledgeDiagnostics.issues.join(" · ")
                            : language === "zh"
                              ? `诊断通过：${knowledgeDiagnostics.documentCount} 个文档`
                              : `Healthy: ${knowledgeDiagnostics.documentCount} documents`}
                        </p>
                      )}
                    </section>
                    <div className="upload-panel">
                      <div>
                        <h4>{t.maintenance}</h4>
                        <p>{t.supportedDocs}</p>
                      </div>
                      <label className="upload-button">
                        {uploadingBaseId === activeBase.id
                          ? `${t.processing} ${uploadProgress.current}/${uploadProgress.total}`
                          : t.chooseDocuments}
                        <input
                          type="file"
                          multiple
                          accept=".md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf"
                          disabled={uploadingBaseId === activeBase.id}
                          onChange={(event) =>
                            uploadDocuments(
                              activeBase.id,
                              event.currentTarget.files,
                              event.currentTarget,
                            )
                          }
                        />
                      </label>
                    </div>
                    {activeDocuments.length === 0 ? (
                      <p className="empty-documents">{t.noDocuments}</p>
                    ) : filteredDocuments.length === 0 ? (
                      <p className="empty-documents">{t.noSearchResults}</p>
                    ) : (
                      <div className="document-list detail-document-list">
                        {filteredDocuments.map((document) => (
                          <div className="document-item" key={document.id}>
                            <div className="document-main">
                              <span
                                className="document-name"
                                title={document.filename}
                              >
                                {document.filename}
                              </span>
                              <span
                                className={`document-status ${document.status.toLowerCase()}`}
                              >
                                {documentStatus(document.status, t)}
                              </span>
                            </div>
                            {document.error && (
                              <span className="document-error">
                                {document.error}
                              </span>
                            )}
                            <div className="document-actions">
                              <button
                                className="document-action"
                                onClick={() => openDocumentDetails(document)}
                              >
                                {t.viewDocument}
                              </button>
                              <button
                                className="document-action"
                                disabled={documentActionId === document.id}
                                onClick={() => reindexDocument(document)}
                              >
                                {t.reindex}
                              </button>
                              <button
                                className="document-action danger"
                                disabled={documentActionId === document.id}
                                onClick={() => deleteDocument(document)}
                              >
                                {t.delete}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : knowledgeSection === "qa" ? (
                  <div className="qa-panel">
                    <label className="field">
                      <span>{t.qaPrompt}</span>
                      <textarea
                        rows={7}
                        value={activeQaSettings.prompt}
                        onChange={(event) =>
                          updateQaSettings({ prompt: event.target.value })
                        }
                        placeholder={t.qaPromptPlaceholder}
                      />
                    </label>
                    <label className="field qa-top-k">
                      <span>{t.topK}</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={activeQaSettings.topK}
                        onChange={(event) =>
                          updateQaSettings({
                            topK: Math.max(
                              1,
                              Math.min(20, Number(event.target.value) || 1),
                            ),
                          })
                        }
                      />
                      <small className="field-hint">{t.topKHint}</small>
                    </label>
                  </div>
                ) : (
                  <section className="knowledge-retrieval-panel">
                    <div className="knowledge-retrieval-heading">
                      <div>
                        <h4>{t.retrievalTest}</h4>
                        <p>{t.retrievalPlaceholder}</p>
                      </div>
                      <span className="binding-count">
                        {activeQaSettings.topK}
                      </span>
                    </div>
                    <form
                      className="knowledge-retrieval-form"
                      onSubmit={runRetrieval}
                    >
                      <input
                        value={retrievalQuery}
                        onChange={(event) =>
                          setRetrievalQuery(event.target.value)
                        }
                        placeholder={t.retrievalPlaceholder}
                        aria-label={t.retrievalTest}
                      />
                      <button
                        type="submit"
                        disabled={retrievalLoading || !retrievalQuery.trim()}
                      >
                        {retrievalLoading ? t.loading : t.runRetrieval}
                      </button>
                    </form>
                    {retrievalError && (
                      <p className="error">{retrievalError}</p>
                    )}
                    {!retrievalLoading &&
                      retrievalQuery.trim() &&
                      retrievalResults.length === 0 &&
                      !retrievalError && (
                        <p className="binding-empty">{t.retrievalEmpty}</p>
                      )}
                    {retrievalResults.length > 0 && (
                      <div className="retrieval-results">
                        {retrievalResults.map((result, index) => (
                          <article
                            className="retrieval-result"
                            key={`${result.documentId}-${index}`}
                          >
                            <div className="retrieval-result-meta">
                              <strong>{result.filename}</strong>
                              <span>
                                {result.pageNumber
                                  ? `第 ${result.pageNumber} 页 · `
                                  : ""}
                                {(1 - result.distance).toFixed(3)}
                              </span>
                            </div>
                            <p>{result.content}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "mcp-servers" && (
          <section className="mcp-page">
            <div className="resource-toolbar">
              <div>
                <p className="muted">{t.mcpServersSubtitle}</p>
              </div>
              <button onClick={() => openMcpDialog()}>{t.newMcpServer}</button>
            </div>
            {mcpServers.length === 0 ? (
              <p className="empty-documents">{t.noResources}</p>
            ) : (
              <div
                className="mcp-list"
                role="list"
                aria-label={t.mcpServersTitle}
              >
                <div className="mcp-list-header" aria-hidden="true">
                  <span>{t.mcpServerName}</span>
                  <span>{t.mcpStatusUnknown}</span>
                  <span>
                    {t.mcpTransportLabel} / {t.mcpServerUrlLabel}
                  </span>
                  <span>{t.mcpInterfaces}</span>
                  <span>
                    {t.mcpLatency} / {t.mcpLastChecked}
                  </span>
                  <span>{t.toolsMenu}</span>
                </div>
                {filteredMcpServers.map((server) => (
                  <article
                    className="mcp-list-row"
                    role="listitem"
                    key={server.id}
                  >
                    <div className="mcp-service-cell">
                      <div className="mcp-service-heading">
                        <strong>{server.name}</strong>
                        <span
                          className={`mcp-status ${(server.status ?? "UNKNOWN").toLowerCase()}`}
                        >
                          {mcpStatusLabel(server.status)}
                        </span>
                      </div>
                      <p>{server.description || t.noDescription}</p>
                      <code title={server.id}>{server.id}</code>
                    </div>
                    <div className="mcp-status-cell">
                      <span
                        className={`mcp-status ${(server.status ?? "UNKNOWN").toLowerCase()}`}
                      >
                        {mcpStatusLabel(server.status)}
                      </span>
                    </div>
                    <div className="mcp-endpoint-cell">
                      <span className="mcp-transport-tag">
                        {server.transport}
                      </span>
                      <span className="mcp-endpoint" title={server.serverUrl}>
                        {server.serverUrl}
                      </span>
                    </div>
                    <div className="mcp-count-cell">
                      <strong>{server.interfaceCount ?? 0}</strong>
                      <span>{t.mcpInterfaces}</span>
                    </div>
                    <div className="mcp-check-cell">
                      <strong>
                        {server.lastLatencyMs != null
                          ? `${server.lastLatencyMs} ms`
                          : "—"}
                      </strong>
                      <span>
                        {server.lastCheckedAt
                          ? new Date(server.lastCheckedAt).toLocaleString()
                          : t.mcpStatusUnknown}
                      </span>
                    </div>
                    <div className="mcp-row-actions">
                      {server.lastError && (
                        <Tooltip
                          placement="top"
                          content={t.mcpErrorTooltip}
                        >
                          <button
                            type="button"
                            className="mcp-row-error-trigger"
                            onClick={() => setMcpErrorDetail(server)}
                            aria-label={t.mcpErrorDetail}
                          >
                            <span className="mcp-row-error-icon" aria-hidden="true">
                              ⚠
                            </span>
                            <span className="mcp-row-error-summary">
                              {truncateError(server.lastError)}
                            </span>
                          </button>
                        </Tooltip>
                      )}
                      <button
                        className="secondary"
                        onClick={() => setMcpDetails(server)}
                      >
                        {t.mcpDetails}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => openMcpDialog(server)}
                        disabled={mcpActionId === server.id}
                      >
                        {t.edit}
                      </button>
                      <button
                        onClick={() => checkMcpHealth(server)}
                        disabled={mcpActionId === server.id}
                      >
                        {mcpActionId === server.id ? t.loading : t.mcpHealth}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => toggleMcpServer(server)}
                        disabled={mcpActionId === server.id}
                      >
                        {server.enabled ? t.stop : t.enable}
                      </button>
                      <button
                        className="agent-delete"
                        onClick={() => deleteMcpServer(server)}
                        disabled={mcpActionId === server.id || server.enabled}
                        title={server.enabled ? t.deleteDisabledEnabled : undefined}
                      >
                        {t.deleteResource}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "tools" && (
          <section>
            <div className="resource-toolbar">
              <div>
                <p className="muted">{t.toolsSubtitle}</p>
              </div>
              <div className="resource-toolbar-actions">
                <select
                  className="resource-filter"
                  value={resourceStatus}
                  onChange={(event) =>
                    setResourceStatus(
                      event.target.value as typeof resourceStatus,
                    )
                  }
                  aria-label={t.statusFilter}
                >
                  <option value="all">{t.allStatuses}</option>
                  <option value="enabled">{t.enabled}</option>
                  <option value="disabled">{t.disabled}</option>
                </select>
                <button onClick={() => openResourceDialog("tool")}>
                  {t.newTool}
                </button>
              </div>
            </div>
            <div className="resource-section">
              <h3>{t.tool}</h3>
              {tools.length === 0 ? (
                <p className="empty-documents">{t.noResources}</p>
              ) : filteredTools.length === 0 ? (
                <p className="empty-documents">{t.noSearchResults}</p>
              ) : (
                <div className="grid">
                  {filteredTools.map((tool) => (
                    <article key={tool.id}>
                      <div className="row">
                        <strong>{tool.name}</strong>
                        <span className={tool.enabled ? "ok" : "off"}>
                          {tool.enabled ? t.enabled : t.disabled}
                        </span>
                      </div>
                      <code>{tool.id}</code>
                      <p>{tool.description || t.noDescription}</p>
                      <div className="resource-meta">
                        <span>{tool.type || t.toolTypeLabel}</span>
                        {tool.method && <span>{tool.method}</span>}
                        {tool.endpoint && <span>{tool.endpoint}</span>}
                      </div>
                      <div className="agent-actions">
                        <button
                          className="secondary"
                          onClick={() => openResourceDialog("tool", tool)}
                          disabled={resourceActionId === tool.id}
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => toggleResource("tool", tool)}
                          disabled={resourceActionId === tool.id}
                        >
                          {tool.enabled ? t.stop : t.enable}
                        </button>
                        <button
                          className="agent-delete"
                          onClick={() => deleteResource("tool", tool)}
                          disabled={resourceActionId === tool.id || tool.enabled}
                          title={tool.enabled ? t.deleteDisabledEnabled : undefined}
                        >
                          {t.deleteResource}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "skills" && (
          <section>
            <div className="resource-toolbar">
              <p className="muted">{t.skillsSubtitle}</p>
              <div className="resource-toolbar-actions">
                <select
                  className="resource-filter"
                  value={resourceStatus}
                  onChange={(event) =>
                    setResourceStatus(
                      event.target.value as typeof resourceStatus,
                    )
                  }
                  aria-label={t.statusFilter}
                >
                  <option value="all">{t.allStatuses}</option>
                  <option value="enabled">{t.enabled}</option>
                  <option value="disabled">{t.disabled}</option>
                </select>
                <button onClick={() => openResourceDialog("skill")}>
                  {t.newSkill}
                </button>
              </div>
            </div>
            <div className="resource-section">
              <h3>{t.skill}</h3>
              {skills.length === 0 ? (
                <p className="empty-documents">{t.noResources}</p>
              ) : filteredSkills.length === 0 ? (
                <p className="empty-documents">{t.noSearchResults}</p>
              ) : (
                <div className="grid">
                  {filteredSkills.map((skill) => (
                    <article key={skill.id}>
                      <div className="row">
                        <strong>{skill.name}</strong>
                        <span className={skill.enabled ? "ok" : "off"}>
                          {skill.enabled ? t.enabled : t.disabled}
                        </span>
                      </div>
                      <code>{skill.id}</code>
                      <p>{skill.description || t.noDescription}</p>
                      <div className="resource-meta">
                        <span>v{skill.version || "1.0.0"}</span>
                      </div>
                      <div className="agent-actions">
                        <button
                          className="secondary"
                          onClick={() => openResourceDialog("skill", skill)}
                          disabled={resourceActionId === skill.id}
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => toggleResource("skill", skill)}
                          disabled={resourceActionId === skill.id}
                        >
                          {skill.enabled ? t.stop : t.enable}
                        </button>
                        <button
                          className="agent-delete"
                          onClick={() => deleteResource("skill", skill)}
                          disabled={
                            resourceActionId === skill.id || skill.enabled
                          }
                          title={skill.enabled ? t.deleteDisabledEnabled : undefined}
                        >
                          {t.deleteResource}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "hooks" && (
          <section>
            <div className="resource-toolbar">
              <p className="muted">{t.hooksSubtitle}</p>
              <button type="button" onClick={() => openHookDialog()}>
                {t.newHook}
              </button>
            </div>
            {hooks.length === 0 ? (
              <p className="empty-documents">{t.noHooks}</p>
            ) : filteredHooks.length === 0 ? (
              <p className="empty-documents">{t.noSearchResults}</p>
            ) : (
              <div className="grid">
                {filteredHooks.map((hook) => (
                  <article key={hook.id}>
                    <div className="row">
                      <strong>{hook.name}</strong>
                      <span className={hook.enabled ? "ok" : "off"}>
                        {hook.enabled ? t.enabled : t.disabled}
                      </span>
                    </div>
                    <code>{hook.id}</code>
                    <p>{hook.description || t.noDescription}</p>
                    <div className="resource-meta">
                      <span>{t.preAgent}</span>
                      <span>{hook.ruleType}</span>
                      <span>
                        {t.hookPriority}: {hook.priority}
                      </span>
                    </div>
                    <div className="agent-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => openHookDialog(hook)}
                        disabled={hookActionId === hook.id}
                      >
                        {t.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleHook(hook)}
                        disabled={hookActionId === hook.id}
                      >
                        {hook.enabled ? t.stop : t.enable}
                      </button>
                      <button
                        type="button"
                        className="agent-delete"
                        onClick={() => deleteHook(hook)}
                        disabled={hookActionId === hook.id || hook.enabled}
                        title={hook.enabled ? t.deleteDisabledEnabled : undefined}
                      >
                        {t.deleteResource}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "ratings" && (
          <section>
            <p className="muted">{t.ratingsSubtitle}</p>
            {(() => {
              const missingReasonCount = feedback.filter(
                (item) => item.rating === "down" && !item.comment,
              ).length;
              if (missingReasonCount === 0) return null;
              return (
                <p className="feedback-summary-missing" role="status">
                  <span aria-hidden="true">!</span>
                  {t.missingReasonCount(missingReasonCount)}
                </p>
              );
            })()}
            {feedbackSummary && (
              <div className="feedback-summary-grid">
                <div className="feedback-summary-card">
                  <span>{t.totalFeedback}</span>
                  <strong>{feedbackSummary.total}</strong>
                </div>
                <div className="feedback-summary-card">
                  <span>{t.satisfactionRate}</span>
                  <strong>{feedbackSummary.satisfactionRate}%</strong>
                </div>
                <div className="feedback-summary-card positive">
                  <span>{t.ratingUp}</span>
                  <strong>{feedbackSummary.up}</strong>
                </div>
                <div className="feedback-summary-card negative">
                  <span>{t.ratingDown}</span>
                  <strong>{feedbackSummary.down}</strong>
                </div>
              </div>
            )}
            {feedbackSummary && feedbackSummary.suggestions.length > 0 && (
              <div className="feedback-guidance">
                <h3>{t.improvementSuggestions}</h3>
                <ul>
                  {feedbackSummary.suggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {feedbackSummary &&
              Object.keys(feedbackSummary.downReasons).length > 0 && (
                <div className="feedback-reasons">
                  <h3>{t.downReasons}</h3>
                  {Object.entries(feedbackSummary.downReasons).map(
                    ([reason, count]) => (
                      <div className="feedback-reason-row" key={reason}>
                        <span>{reason}</span>
                        <strong>{count}</strong>
                      </div>
                    ),
                  )}
                </div>
              )}
            {feedback.length === 0 ? (
              <p className="empty-documents">{t.noFeedback}</p>
            ) : filteredFeedback.length === 0 ? (
              <p className="empty-documents">{t.noSearchResults}</p>
            ) : (
              <div className="feedback-list">
                {filteredFeedback.map((item) => (
                  <article className="feedback-card" key={item.id}>
                    <div className="row">
                      <strong>{item.agentId || "-"}</strong>
                      <span className={item.rating === "up" ? "ok" : "off"}>
                        {item.rating === "up" ? t.ratingUp : t.ratingDown}
                      </span>
                    </div>
                    <code>{item.sessionId || item.messageId || ""}</code>
                    {item.comment && (
                      <p className="feedback-comment">{item.comment}</p>
                    )}
                    {(item.userMessage || item.messageContent) && (
                      <details className="feedback-context">
                        <summary>{t.feedbackContext}</summary>
                        {item.userMessage && (
                          <p>
                            <strong>{t.userQuestion}：</strong>
                            {item.userMessage}
                          </p>
                        )}
                        {item.messageContent && (
                          <p>
                            <strong>{t.assistantAnswer}：</strong>
                            {item.messageContent}
                          </p>
                        )}
                      </details>
                    )}
                    {!item.comment && item.rating === "down" && (
                      <span className="feedback-missing-reason">
                        <span className="feedback-missing-reason-icon" aria-hidden="true">
                          !
                        </span>
                        {t.noReason}
                      </span>
                    )}
                    {item.createdAt && (
                      <small>{new Date(item.createdAt).toLocaleString()}</small>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "conversation-logs" && (
          <>
            <section className="conversation-logs-page">
              <p className="muted">{t.conversationLogsSubtitle}</p>

              <div className="conversation-filter" role="search">
                <label className="conversation-filter-field">
                  <span>{t.conversationSessionId}</span>
                  <input
                    type="text"
                    value={conversationSessionIdDraft}
                    onChange={(event) =>
                      setConversationSessionIdDraft(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        setConversationSessionId(
                          conversationSessionIdDraft.trim(),
                        );
                        setConversationPage(1);
                      }
                    }}
                    placeholder={t.conversationSessionIdPlaceholder}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setConversationSessionId(
                      conversationSessionIdDraft.trim(),
                    );
                    setConversationPage(1);
                  }}
                >
                  {t.query}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setConversationSessionIdDraft("");
                    setConversationSessionId("");
                    setConversationPage(1);
                  }}
                >
                  {t.reset}
                </button>
              </div>

              {conversationLoading ? (
                <p className="empty-documents">{t.loading}</p>
              ) : conversationLogs.length === 0 ? (
                <p className="empty-documents">
                  {conversationSessionId
                    ? t.noSearchResults
                    : t.noConversationLogs}
                </p>
              ) : (
                <>
                  <div className="conversation-table-wrap">
                    <table className="conversation-table">
                      <thead>
                        <tr>
                          <th>{t.conversationSessionId}</th>
                          <th>{t.conversationTitle}</th>
                          <th>{t.updatedAt}</th>
                          <th>{t.messageCount}</th>
                          <th className="conversation-table-actions">
                            {t.detail}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {conversationLogs.map((log) => (
                          <tr key={log.id}>
                            <td>
                              <code className="conversation-id">{log.id}</code>
                            </td>
                            <td>{log.title || "-"}</td>
                            <td>
                              {log.updatedAt
                                ? new Date(log.updatedAt).toLocaleString()
                                : "-"}
                            </td>
                            <td>{log.messageCount}</td>
                            <td className="conversation-table-actions">
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => openConversationDetail(log.id)}
                              >
                                {t.detail}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={conversationPage}
                    pageSize={conversationPageSize}
                    total={conversationTotal}
                    labels={{
                      total: t.paginationTotal,
                      pageSize: t.perPage,
                      position: t.paginationPosition,
                      prev: t.prevPage,
                      next: t.nextPage,
                    }}
                    onPageChange={setConversationPage}
                    onPageSizeChange={(size) => {
                      setConversationPageSize(size);
                      setConversationPage(1);
                    }}
                  />
                </>
              )}
            </section>

            {conversationDetailOpen && (
              <div
                className="conversation-detail-overlay"
                onClick={() => setConversationDetailOpen(false)}
              >
                <div
                  className="conversation-detail-panel"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="conversation-detail-head">
                    <div>
                      <h3>
                        {conversationDetail?.title ||
                          conversationDetail?.id ||
                          t.conversationDetailTitle}
                      </h3>
                      {conversationDetail && (
                        <code>{conversationDetail.id}</code>
                      )}
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setConversationDetailOpen(false)}
                    >
                      {t.close}
                    </button>
                  </div>

                  {conversationDetailLoading ? (
                    <p className="empty-documents">{t.loading}</p>
                  ) : !conversationDetail ? (
                    <p className="empty-documents">{t.noSearchResults}</p>
                  ) : (
                    <div className="conversation-log-body conversation-detail-body">
                      <section>
                        <h4>
                          {t.userMessage} / {t.assistantMessage}
                        </h4>
                        <div className="conversation-log-messages">
                          {conversationDetail.messages.length === 0 ? (
                            <p className="binding-empty">-</p>
                          ) : (
                            conversationDetail.messages.map((item) => (
                              <div
                                className={
                                  item.role === "user"
                                    ? "conversation-log-message user"
                                    : "conversation-log-message assistant"
                                }
                                key={item.id}
                              >
                                <div className="conversation-log-message-meta">
                                  <strong>
                                    {item.role === "user"
                                      ? t.userMessage
                                      : t.assistantMessage}
                                  </strong>
                                  {item.agentId && (
                                    <code>{item.agentId}</code>
                                  )}
                                  {item.createdAt && (
                                    <small>
                                      {new Date(
                                        item.createdAt,
                                      ).toLocaleString()}
                                    </small>
                                  )}
                                </div>
                                <p>{item.content || "-"}</p>
                                {item.contextSummary && (
                                  <details>
                                    <summary>Context</summary>
                                    <pre>{item.contextSummary}</pre>
                                  </details>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                      <section>
                        <h4>{t.invocationDetails}</h4>
                        {conversationDetail.invocations.length === 0 ? (
                          <p className="binding-empty">-</p>
                        ) : (
                          <div className="conversation-log-invocations">
                            {conversationDetail.invocations.map((item) => (
                              <div
                                className="conversation-log-invocation"
                                key={item.id}
                              >
                                <div className="conversation-log-message-meta">
                                  <strong>{item.selectedAgentId || "-"}</strong>
                                  {item.createdAt && (
                                    <small>
                                      {new Date(
                                        item.createdAt,
                                      ).toLocaleString()}
                                    </small>
                                  )}
                                </div>
                                <div className="conversation-log-fields">
                                  <span>
                                    {t.route}: {item.requestedAgentId || "auto"}
                                  </span>
                                  <span>
                                    {t.confidence}:{" "}
                                    {item.confidence == null
                                      ? "-"
                                      : item.confidence.toFixed(2)}
                                  </span>
                                  <span>
                                    {t.duration}:{" "}
                                    {item.durationMs == null
                                      ? "-"
                                      : `${item.durationMs} ms`}
                                  </span>
                                  <span>
                                    {t.routeSource}: {item.routeSource || "-"}
                                  </span>
                                  <span>
                                    {t.clientIp}: {item.clientIp || "-"}
                                  </span>
                                  <span>
                                    {t.routeTrail}:{" "}
                                    {item.requestedAgentId || "auto"} →{" "}
                                    {item.selectedAgentId || "-"}
                                  </span>
                                </div>
                                <div className="conversation-log-trace">
                                  <div>
                                    <strong>{t.intentResult}</strong>
                                    <p>
                                      {item.intent ||
                                        item.routeReason ||
                                        "-"}
                                    </p>
                                  </div>
                                  <div>
                                    <strong>{t.contextTransfer}</strong>
                                    <pre>{item.contextSent || "-"}</pre>
                                  </div>
                                  <div>
                                    <strong>{t.responseTransfer}</strong>
                                    <pre>{item.responseContent || "-"}</pre>
                                  </div>
                                </div>
                                {item.routeReason && <p>{item.routeReason}</p>}
                                {item.error && (
                                  <p className="error">{item.error}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                      <section>
                        <h4>{t.actionDetails}</h4>
                        {conversationDetail.actions.length === 0 ? (
                          <p className="binding-empty">-</p>
                        ) : (
                          <div className="conversation-log-invocations">
                            {conversationDetail.actions.map((item) => (
                              <div
                                className="conversation-log-invocation"
                                key={item.actionId}
                              >
                                <div className="conversation-log-message-meta">
                                  <strong>{item.type || "-"}</strong>
                                  <span
                                    className={
                                      item.status === "COMPLETED"
                                        ? "ok"
                                        : item.status === "FAILED"
                                          ? "off"
                                          : "badge"
                                    }
                                  >
                                    {item.status === "COMPLETED"
                                      ? t.actionCompleted
                                      : item.status === "FAILED"
                                        ? t.actionFailed
                                        : t.actionPending}
                                  </span>
                                </div>
                                <code>{item.target || item.actionId}</code>
                                {item.reason && <p>{item.reason}</p>}
                                {item.result && <pre>{item.result}</pre>}
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "router" && (
          <section className="router-test-page">
            <div className="router-test-form">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t.routerPlaceholder}
                rows={4}
              />
              <textarea
                value={routePageContext}
                onChange={(event) => setRoutePageContext(event.target.value)}
                placeholder={t.routerContextPlaceholder}
                rows={3}
              />
              <div className="router-test-actions">
                <button
                  type="button"
                  onClick={testRoute}
                  disabled={!message.trim()}
                >
                  {t.testRoute}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={analyzeRoute}
                  disabled={!route || routeAnalyzing}
                >
                  {routeAnalyzing ? t.analyzing : t.smartAnalyze}
                </button>
              </div>
            </div>
            {!route ? (
              <p className="empty-documents">{t.routeChainEmpty}</p>
            ) : (
              <>
                <div className="router-result-summary">
                  <div>
                    <span>{t.route}</span>
                    <strong>
                      {String(route.displayName ?? route.agentId ?? "-")}
                    </strong>
                  </div>
                  <div>
                    <span>{t.confidence}</span>
                    <strong>
                      {route.confidence == null
                        ? "-"
                        : `${Math.round(Number(route.confidence) * 100)}%`}
                    </strong>
                  </div>
                  <div>
                    <span>{t.routeSource}</span>
                    <strong>{String(route.routeSource ?? "-")}</strong>
                  </div>
                </div>
                <section className="router-chain-panel">
                  <h3>{t.routeChain}</h3>
                  <div className="router-chain">
                    {(
                      (route.steps as
                        Array<Record<string, unknown>> | undefined) ?? []
                    ).map((step, index) => {
                      const details =
                        (step.details as Record<string, unknown> | undefined) ??
                        {};
                      const type = String(step.type ?? "");
                      const title =
                        type === "input"
                          ? t.routeInput
                          : type === "intent"
                            ? t.routeIntent
                            : type === "dispatch"
                              ? t.routeDispatch
                              : type === "hooks"
                                ? t.routeHooks
                                : String(step.title ?? type);
                      const checks = Array.isArray(details.checks)
                        ? (details.checks as Array<Record<string, unknown>>)
                        : [];
                      return (
                        <div
                          className="router-chain-step"
                          key={`${type}-${index}`}
                        >
                          <span className="router-chain-index">
                            {index + 1}
                          </span>
                          <div className="router-chain-content">
                            <strong>{title}</strong>
                            {type === "intent" && (
                              <p>
                                {String(details.intent ?? route.reason ?? "-")}
                              </p>
                            )}
                            {type === "dispatch" && (
                              <p>
                                {String(
                                  details.displayName ??
                                    route.displayName ??
                                    details.agentId ??
                                    "-",
                                )}
                              </p>
                            )}
                            {type === "input" && (
                              <p>
                                {details.pageContextIncluded
                                  ? "✓ 页面上下文"
                                  : "— 无页面上下文"}
                              </p>
                            )}
                            {type === "hooks" &&
                              (checks.length === 0 ? (
                                <p>{t.hookPassed}</p>
                              ) : (
                                <div className="router-hook-checks">
                                  {checks.map((check) => (
                                    <span
                                      className={check.passed ? "ok" : "off"}
                                      key={String(check.hookId)}
                                    >
                                      {String(check.hookName)} ·{" "}
                                      {check.passed
                                        ? t.hookPassed
                                        : t.hookRejected}
                                    </span>
                                  ))}
                                </div>
                              ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                {routeAnalysis && (
                  <section className="router-analysis">
                    <h3>{t.routeAnalysis}</h3>
                    <p>{routeAnalysis}</p>
                  </section>
                )}
              </>
            )}
          </section>
        )}
      </main>
      {promptError && (
        <div className="prompt-modal-overlay" role="presentation">
          <div
            className="prompt-modal"
            role="alertdialog"
            aria-modal="true"
            aria-label={t.error}
          >
            <h3>{t.error}</h3>
            <p>{promptError}</p>
            <button type="button" onClick={dismissPromptError}>
              {t.close}
            </button>
          </div>
        </div>
      )}

      {selectedDocument && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setSelectedDocument(undefined);
          }}
        >
          <div
            className="modal document-details-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <h3>{selectedDocument.filename}</h3>
                <p className="modal-subtitle">{t.documentDetails}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelectedDocument(undefined)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <div className="document-detail-meta">
              <span>{documentStatus(selectedDocument.status, t)}</span>
              {selectedDocument.sizeBytes !== undefined && (
                <span>
                  {t.documentSize}:{" "}
                  {(selectedDocument.sizeBytes / 1024).toFixed(1)} KB
                </span>
              )}
              {selectedDocument.fileHash && (
                <code title={selectedDocument.fileHash}>
                  {t.documentHash}: {selectedDocument.fileHash.slice(0, 16)}…
                </code>
              )}
            </div>
            <h4>{t.documentChunks}</h4>
            {chunksLoading ? (
              <p className="binding-empty">{t.loading}</p>
            ) : documentChunks.length === 0 ? (
              <p className="binding-empty">{t.retrievalEmpty}</p>
            ) : (
              <div className="chunk-list">
                {documentChunks.map((chunk) => (
                  <article className="chunk-item" key={chunk.id}>
                    <div>
                      <strong>#{chunk.chunkIndex + 1}</strong>
                      {chunk.pageNumber ? (
                        <span> · 第 {chunk.pageNumber} 页</span>
                      ) : null}
                    </div>
                    <pre>{chunk.content}</pre>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {resourceDetails && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setResourceDetails(undefined);
          }}
        >
          <div
            className="modal resource-details-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <h3>{resourceDetails.resource.name}</h3>
                <p className="modal-subtitle">{t.resourceDetails}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setResourceDetails(undefined)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <div className="resource-detail-grid">
              <div>
                <span className="detail-label">ID</span>
                <code>{resourceDetails.resource.id}</code>
              </div>
              <div>
                <span className="detail-label">{t.enabled}</span>
                <span
                  className={resourceDetails.resource.enabled ? "ok" : "off"}
                >
                  {resourceDetails.resource.enabled ? t.enabled : t.disabled}
                </span>
              </div>
              {resourceDetails.kind === "tool" ? (
                <>
                  <div>
                    <span className="detail-label">{t.toolTypeLabel}</span>
                    <span>{resourceDetails.resource.type || "-"}</span>
                  </div>
                  <div>
                    <span className="detail-label">{t.method}</span>
                    <span>{resourceDetails.resource.method || "-"}</span>
                  </div>
                  <div className="detail-full">
                    <span className="detail-label">{t.endpoint}</span>
                    <code>{resourceDetails.resource.endpoint || "-"}</code>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="detail-label">{t.version}</span>
                    <span>{resourceDetails.resource.version || "-"}</span>
                  </div>
                  <div className="detail-full">
                    <span className="detail-label">{t.skillPrompt}</span>
                    <pre>{resourceDetails.resource.prompt || "-"}</pre>
                  </div>
                </>
              )}
              <div className="detail-full">
                <span className="detail-label">{t.descriptionOptional}</span>
                <p>{resourceDetails.resource.description || t.noDescription}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {hookDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !hookSubmitting) {
              setHookDialogOpen(false);
            }
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3>{editingHookId ? t.editHook : t.newHook}</h3>
                <p className="modal-subtitle">{t.hooksSubtitle}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setHookDialogOpen(false)}
                disabled={hookSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveHook}>
              <label className="field">
                <span>{t.hookName}</span>
                <input
                  value={hookName}
                  onChange={(event) => setHookName(event.target.value)}
                  required
                  maxLength={160}
                />
              </label>
              <label className="field">
                <span>{t.hookDescription}</span>
                <textarea
                  value={hookDescription}
                  onChange={(event) => setHookDescription(event.target.value)}
                  placeholder={t.hookDescriptionPlaceholder}
                  rows={2}
                  maxLength={500}
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>{t.hookRuleType}</span>
                  <select
                    value={hookRuleType}
                    onChange={(event) => {
                      const type = event.target.value;
                      setHookRuleType(type);
                      if (type === "REQUIRE_PERMISSION") {
                        setHookRuleConfig('{"permission":"readPage"}');
                      } else if (type === "KEYWORD_BLOCK") {
                        setHookRuleConfig('{"keywords":["delete","export"]}');
                      } else if (type === "MAX_MESSAGE_LENGTH") {
                        setHookRuleConfig('{"maxLength":4000}');
                      } else {
                        setHookRuleConfig("{}");
                      }
                    }}
                  >
                    <option value="REQUIRE_PERMISSION">
                      {t.requirePermission}
                    </option>
                    <option value="REQUIRE_PAGE_CONTEXT">
                      {t.requirePageContext}
                    </option>
                    <option value="KEYWORD_BLOCK">{t.keywordBlock}</option>
                    <option value="MAX_MESSAGE_LENGTH">
                      {t.maxMessageLength}
                    </option>
                  </select>
                </label>
                <label className="field">
                  <span>{t.hookPriority}</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={hookPriority}
                    onChange={(event) =>
                      setHookPriority(Number(event.target.value) || 0)
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span>{t.hookRuleConfig}</span>
                <textarea
                  value={hookRuleConfig}
                  onChange={(event) => setHookRuleConfig(event.target.value)}
                  placeholder={t.hookRuleConfigPlaceholder}
                  rows={3}
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>{t.hookFailureMessage}</span>
                <input
                  value={hookFailureMessage}
                  onChange={(event) =>
                    setHookFailureMessage(event.target.value)
                  }
                  placeholder={t.hookFailureMessagePlaceholder}
                  maxLength={300}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={hookEnabled}
                  onChange={(event) => setHookEnabled(event.target.checked)}
                />
                <span>{t.enabled}</span>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setHookDialogOpen(false)}
                  disabled={hookSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={hookSubmitting}>
                  {hookSubmitting ? t.saving : t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {agentDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAgentDialog();
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-dialog-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="agent-dialog-title">
                  {editingAgentId ? t.editAgentTitle : t.newAgentTitle}
                </h3>
                <p className="modal-subtitle">
                  {editingAgentId ? t.editAgentSubtitle : t.newAgentSubtitle}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeAgentDialog}
                disabled={agentSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveAgent}>
              {editingAgentId && (
                <label className="field">
                  <span>{t.agentId}</span>
                  <input value={agentId} disabled />
                  <small className="field-hint">{t.agentIdHint}</small>
                </label>
              )}
              {agentRole === "SUB" && (
                <label className="field">
                  <span>
                    {t.parentAgent}
                    <span aria-hidden="true" className="required-mark">
                      *
                    </span>
                  </span>
                  <select
                    value={agentParentId}
                    onChange={(event) => setAgentParentId(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      —
                    </option>
                    {agents
                      .filter(
                        (item) => item.role === "DOMAIN" && item.enabled,
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span>{t.displayName}</span>
                <input
                  value={agentDisplayName}
                  onChange={(event) => setAgentDisplayName(event.target.value)}
                  placeholder={t.displayNamePlaceholder}
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={agentDescription}
                  onChange={(event) => setAgentDescription(event.target.value)}
                  placeholder={t.agentDescriptionPlaceholder}
                  rows={2}
                  maxLength={500}
                />
              </label>
              <label className="field">
                <span>{t.systemPrompt}</span>
                <textarea
                  value={agentSystemPrompt}
                  onChange={(event) => setAgentSystemPrompt(event.target.value)}
                  placeholder={t.systemPromptPlaceholder}
                  rows={4}
                  maxLength={8000}
                />
              </label>
              {editingAgentId && (
                <>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={agentBrowserActions}
                      onChange={(event) =>
                        setAgentBrowserActions(event.target.checked)
                      }
                    />
                    <span>{t.browserActions}</span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={agentEnabled}
                      onChange={(event) =>
                        setAgentEnabled(event.target.checked)
                      }
                    />
                    <span>{t.enabled}</span>
                  </label>
                  <div className="field-grid">
                    <label className="field">
                      <span>{t.priority}</span>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={agentPriority}
                        onChange={(event) =>
                          setAgentPriority(Number(event.target.value) || 0)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>{t.temperature}</span>
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={agentTemperature}
                        onChange={(event) =>
                          setAgentTemperature(event.target.value)
                        }
                        placeholder="0.7"
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>{t.model}</span>
                    <input
                      value={agentModel}
                      onChange={(event) => setAgentModel(event.target.value)}
                      placeholder={t.modelPlaceholder}
                    />
                  </label>
                  <section className="binding-section">
                    <div className="binding-heading">
                      <div>
                        <h4>{t.knowledgeBases}</h4>
                        <p>{t.idsHint}</p>
                      </div>
                      <span className="binding-count">
                        {parseIds(agentKnowledgeBaseIds).length}
                      </span>
                    </div>
                    {bases.length === 0 ? (
                      <p className="binding-empty">{t.noKnowledgeBases}</p>
                    ) : (
                      <div className="binding-list">
                        {bases.map((base) => {
                          const selected = parseIds(
                            agentKnowledgeBaseIds,
                          ).includes(base.id);
                          return (
                            <label className="binding-option" key={base.id}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {
                                  const current = parseIds(
                                    agentKnowledgeBaseIds,
                                  );
                                  const next = selected
                                    ? current.filter((id) => id !== base.id)
                                    : [...current, base.id];
                                  setAgentKnowledgeBaseIds(
                                    JSON.stringify(next),
                                  );
                                }}
                              />
                              <span className="binding-copy">
                                <span className="binding-name">
                                  {base.name}
                                </span>
                                <span className="binding-meta">
                                  {base.enabled ? t.enabled : t.disabled}
                                </span>
                                {base.description && (
                                  <span className="binding-description">
                                    {base.description}
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section
                    className="binding-section"
                    aria-labelledby="tool-bindings-title"
                  >
                    <div className="binding-heading">
                      <div>
                        <h4 id="tool-bindings-title">{t.tools}</h4>
                        <p>{t.browserActions}</p>
                      </div>
                      <span className="binding-count">
                        {agentToolIds.length}
                      </span>
                    </div>
                    {tools.filter((tool) => tool.enabled).length === 0 ? (
                      <p className="binding-empty">{t.noTools}</p>
                    ) : (
                      <div className="binding-list">
                        {tools
                          .filter((tool) => tool.enabled)
                          .map((tool) => {
                            const checked = agentToolIds.includes(tool.id);
                            return (
                              <label className="binding-option" key={tool.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setAgentToolIds((current) =>
                                      checked
                                        ? current.filter((id) => id !== tool.id)
                                        : [...current, tool.id],
                                    )
                                  }
                                />
                                <span className="binding-copy">
                                  <span className="binding-name">
                                    {tool.name}
                                  </span>
                                  <span className="binding-meta">
                                    {tool.type === "BROWSER_PROPOSAL"
                                      ? t.browserProposal
                                      : (tool.type ?? t.toolType)}
                                  </span>
                                  {tool.description && (
                                    <span className="binding-description">
                                      {tool.description}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="binding-detail-button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setResourceDetails({
                                      kind: "tool",
                                      resource: tool,
                                    });
                                  }}
                                >
                                  {t.viewDetails}
                                </button>
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </section>

                  <section
                    className="binding-section"
                    aria-labelledby="skill-bindings-title"
                  >
                    <div className="binding-heading">
                      <div>
                        <h4 id="skill-bindings-title">{t.skills}</h4>
                        <p>{t.idsHint}</p>
                      </div>
                      <span className="binding-count">
                        {agentSkillIds.length}
                      </span>
                    </div>
                    {skills.filter((skill) => skill.enabled).length === 0 ? (
                      <p className="binding-empty">{t.noSkills}</p>
                    ) : (
                      <div className="binding-list">
                        {skills
                          .filter((skill) => skill.enabled)
                          .map((skill) => {
                            const checked = agentSkillIds.includes(skill.id);
                            return (
                              <label className="binding-option" key={skill.id}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setAgentSkillIds((current) =>
                                      checked
                                        ? current.filter(
                                            (id) => id !== skill.id,
                                          )
                                        : [...current, skill.id],
                                    )
                                  }
                                />
                                <span className="binding-copy">
                                  <span className="binding-name">
                                    {skill.name}
                                  </span>
                                  {skill.version && (
                                    <span className="binding-meta">
                                      v{skill.version}
                                    </span>
                                  )}
                                  {skill.description && (
                                    <span className="binding-description">
                                      {skill.description}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="binding-detail-button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setResourceDetails({
                                      kind: "skill",
                                      resource: skill,
                                    });
                                  }}
                                >
                                  {t.viewDetails}
                                </button>
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </section>
                </>
              )}
              {agentError && <p className="error">{agentError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAgentDialog}
                  disabled={agentSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={agentSubmitting}>
                  {agentSubmitting
                    ? t.saving
                    : editingAgentId
                      ? t.saveAgent
                      : t.createAgent}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mcpDetails && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMcpDetails(undefined);
          }}
        >
          <div
            className="modal mcp-details-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <h3>
                  {mcpDetails.name} · {t.mcpDetails}
                </h3>
                <p className="modal-subtitle">{mcpDetails.serverUrl}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setMcpDetails(undefined)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <div className="mcp-detail-summary">
              <span
                className={`mcp-status ${(mcpDetails.status ?? "UNKNOWN").toLowerCase()}`}
              >
                {mcpStatusLabel(mcpDetails.status)}
              </span>
              <span>
                {mcpDetails.interfaceCount ?? 0} {t.mcpInterfaces}
              </span>
              {mcpDetails.lastLatencyMs != null && (
                <span>
                  {t.mcpLatency}: {mcpDetails.lastLatencyMs} ms
                </span>
              )}
              {mcpDetails.lastCheckedAt && (
                <span>
                  {t.mcpLastChecked}:{" "}
                  {new Date(mcpDetails.lastCheckedAt).toLocaleString()}
                </span>
              )}
            </div>
            <h4>{t.mcpCapabilities}</h4>
            <pre className="mcp-json">
              {mcpDetails.capabilitiesJson || "{}"}
            </pre>
            <h4>{t.mcpDetails}</h4>
            {parseMcpInterfaces(mcpDetails).length === 0 ? (
              <p className="binding-empty">{t.mcpNoInterfaces}</p>
            ) : (
              <div className="mcp-interface-list">
                {parseMcpInterfaces(mcpDetails).map((item, index) => (
                  <article
                    className="mcp-interface"
                    key={`${item.name ?? "interface"}-${index}`}
                  >
                    <strong>{item.name || `#${index + 1}`}</strong>
                    {item.description && <p>{item.description}</p>}
                    {Boolean(item.inputSchema) && (
                      <pre className="mcp-json">
                        {JSON.stringify(item.inputSchema, null, 2) ?? "{}"}
                      </pre>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mcpErrorDetail && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMcpErrorDetail(null);
          }}
        >
          <div
            className="modal mcp-error-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mcp-error-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="mcp-error-title">
                  {mcpErrorDetail.name} · {t.mcpErrorDetail}
                </h3>
                <p className="modal-subtitle">
                  {t.mcpLastChecked}
                  {mcpErrorDetail.lastCheckedAt
                    ? `: ${new Date(mcpErrorDetail.lastCheckedAt).toLocaleString()}`
                    : `: ${t.mcpStatusUnknown}`}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setMcpErrorDetail(null)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <p className="mcp-error-hint">{t.mcpErrorHint}</p>
            <pre className="mcp-error-body">{mcpErrorDetail.lastError}</pre>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => copyMcpError(mcpErrorDetail.lastError ?? "")}
              >
                {t.copy}
              </button>
              <button
                type="button"
                disabled={mcpActionId === mcpErrorDetail.id}
                onClick={async () => {
                  await checkMcpHealth(mcpErrorDetail);
                  setMcpErrorDetail((current) => {
                    if (!current) return current;
                    const next = mcpServers.find((s) => s.id === current.id);
                    return next ?? current;
                  });
                }}
              >
                {mcpActionId === mcpErrorDetail.id ? t.loading : t.mcpHealth}
              </button>
            </div>
          </div>
        </div>
      )}

      {mcpDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMcpDialog();
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3>
                  {editingMcpId ? t.edit : t.createResource} · {t.mcpServers}
                </h3>
                <p className="modal-subtitle">{t.mcpServersSubtitle}</p>
              </div>
              <button
                className="icon-button"
                onClick={closeMcpDialog}
                disabled={mcpSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveMcpServer}>
              <label className="field">
                <span>{t.mcpServerName}</span>
                <input
                  autoFocus
                  value={mcpName}
                  onChange={(event) => setMcpName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={mcpDescription}
                  onChange={(event) => setMcpDescription(event.target.value)}
                  placeholder={t.mcpDescriptionPlaceholder}
                  rows={2}
                  maxLength={500}
                />
              </label>
              <label className="field">
                <span>{t.mcpServerUrlLabel}</span>
                <input
                  value={mcpServerUrl}
                  onChange={(event) => setMcpServerUrl(event.target.value)}
                  placeholder={t.mcpServerUrlPlaceholder}
                  required
                />
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>{t.mcpTransportLabel}</span>
                  <select
                    value={mcpTransport}
                    onChange={(event) => setMcpTransport(event.target.value)}
                  >
                    <option value="STREAMABLE_HTTP">Streamable HTTP</option>
                    <option value="SSE">SSE</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t.mcpAuthEnvLabel}</span>
                  <input
                    value={mcpAuthEnv}
                    onChange={(event) => setMcpAuthEnv(event.target.value)}
                    placeholder={t.mcpAuthEnvPlaceholder}
                  />
                  <small className="field-hint">{t.mcpAuthEnvHint}</small>
                </label>
              </div>
              {resourceError && (
                <p className="error" role="alert">
                  {resourceError}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeMcpDialog}
                  disabled={mcpSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={mcpSubmitting}>
                  {mcpSubmitting ? t.saving : t.saveResource}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resourceDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeResourceDialog();
          }}
        >
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3>
                  {editingResourceId ? t.edit : t.createResource} ·{" "}
                  {resourceDialog === "tool" ? t.tool : t.skill}
                </h3>
                <p className="modal-subtitle">
                  {resourceDialog === "tool"
                    ? t.toolsSubtitle
                    : t.skillsSubtitle}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeResourceDialog}
                disabled={resourceSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveResource}>
              <label className="field">
                <span>{t.toolName}</span>
                <input
                  autoFocus
                  value={resourceName}
                  onChange={(event) => setResourceName(event.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={resourceDescription}
                  onChange={(event) =>
                    setResourceDescription(event.target.value)
                  }
                  placeholder={
                    resourceDialog === "tool"
                      ? t.toolDescriptionPlaceholder
                      : t.noDescription
                  }
                  rows={2}
                  maxLength={500}
                />
              </label>
              {resourceDialog === "tool" ? (
                <>
                  <div className="field-grid">
                    <label className="field">
                      <span>{t.toolTypeLabel}</span>
                      <select
                        value={resourceType}
                        onChange={(event) =>
                          setResourceType(event.target.value)
                        }
                      >
                        <option value="BROWSER_PROPOSAL">
                          {t.browserProposal}
                        </option>
                        <option value="HTTP">HTTP API</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{t.method}</span>
                      <select
                        value={resourceMethod}
                        onChange={(event) =>
                          setResourceMethod(event.target.value)
                        }
                      >
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map(
                          (method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  {resourceType === "HTTP" && (
                    <label className="field">
                      <span>{t.endpoint}</span>
                      <input
                        value={resourceEndpoint}
                        onChange={(event) =>
                          setResourceEndpoint(event.target.value)
                        }
                        placeholder={t.endpointPlaceholder}
                      />
                      <small className="field-hint">{t.endpointHint}</small>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label className="field">
                    <span>{t.skillPrompt}</span>
                    <textarea
                      value={resourcePrompt}
                      onChange={(event) =>
                        setResourcePrompt(event.target.value)
                      }
                      placeholder={t.skillPromptPlaceholder}
                      rows={5}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t.version}</span>
                    <input
                      value={resourceVersion}
                      onChange={(event) =>
                        setResourceVersion(event.target.value)
                      }
                      placeholder="1.0.0"
                    />
                  </label>
                </>
              )}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={resourceEnabled}
                  onChange={(event) => setResourceEnabled(event.target.checked)}
                />
                <span>{t.enabled}</span>
              </label>
              {resourceError && <p className="error">{resourceError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeResourceDialog}
                  disabled={resourceSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={resourceSubmitting}>
                  {resourceSubmitting
                    ? t.saving
                    : editingResourceId
                      ? t.saveResource
                      : t.createResource}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {agentTestDialogOpen && testingAgent && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAgentTest();
          }}
        >
          <div
            className="modal agent-test-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-test-dialog-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="agent-test-dialog-title">
                  {t.testAgentTitle} · {testingAgent.displayName}
                </h3>
                <p className="modal-subtitle">{t.testAgentSubtitle}</p>
              </div>
              <button
                className="icon-button"
                onClick={closeAgentTest}
                disabled={agentTestSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={runAgentTest}>
              <label className="field">
                <span>{t.testMessage}</span>
                <textarea
                  autoFocus
                  value={agentTestMessage}
                  onChange={(event) => setAgentTestMessage(event.target.value)}
                  placeholder={t.testMessagePlaceholder}
                  rows={4}
                  required
                />
              </label>
              <label className="field">
                <span>{t.testPageContext}</span>
                <textarea
                  value={agentTestContext}
                  onChange={(event) => setAgentTestContext(event.target.value)}
                  placeholder={t.testPageContextPlaceholder}
                  rows={3}
                />
              </label>
              {agentTestError && <p className="error">{agentTestError}</p>}
              {agentTestResult && (
                <section className="test-result" aria-live="polite">
                  <div className="test-result-heading">{t.testResponse}</div>
                  <pre>{agentTestResult}</pre>
                </section>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeAgentTest}
                  disabled={agentTestSubmitting}
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  disabled={agentTestSubmitting || !agentTestMessage.trim()}
                >
                  {agentTestSubmitting ? t.testing : t.runTest}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {baseDialogOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBaseDialog();
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="base-dialog-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="base-dialog-title">{t.newBaseTitle}</h3>
                <p className="modal-subtitle">{t.newBaseSubtitle}</p>
              </div>
              <button
                className="icon-button"
                onClick={closeBaseDialog}
                disabled={baseSubmitting}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <form onSubmit={createBase}>
              <label className="field">
                <span>{t.baseName}</span>
                <input
                  autoFocus
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  placeholder={t.baseNamePlaceholder}
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span>{t.descriptionOptional}</span>
                <textarea
                  value={baseDescription}
                  onChange={(event) => setBaseDescription(event.target.value)}
                  placeholder={t.baseDescriptionPlaceholder}
                  rows={3}
                  maxLength={500}
                />
              </label>
              {baseError && <p className="error">{baseError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={closeBaseDialog}
                  disabled={baseSubmitting}
                >
                  {t.cancel}
                </button>
                <button type="submit" disabled={baseSubmitting}>
                  {baseSubmitting ? t.creating : t.createBase}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmRequest && (
        <ConfirmDialog
          open
          title={confirmRequest.title}
          description={confirmRequest.description}
          confirmLabel={confirmRequest.confirmLabel}
          cancelLabel={confirmRequest.cancelLabel}
          tone={confirmRequest.tone}
          loading={confirmRequest.loading}
          onConfirm={runConfirm}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
