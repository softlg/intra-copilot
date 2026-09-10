# 插件 → 完整 Agent 交互链路诊断

> 范围：浏览器插件（extension）到后端（Spring Boot）到 LLM 的完整交互链路。
> 方法：逐文件代码实证，结论均带 `文件:行号`；非推测。
> 状态：**只读诊断，本轮未改动代码**。

## 一句话结论

当前系统的「Agent」只是 **system prompt 切换器**，不是真正的 Agent。
执行链路缺两个关键能力：

1. **行动（Action）**——工具 / MCP / Skill 从不执行；
2. **观察-再决策（Observation → Re-Act 循环）**——生成一次就结束，没有「执行 → 看结果 → 再决定」的回路。

所以无论后台配了多少工具、Skill、MCP，用户实际拿到的永远是「一个带不同提示词的聊天机器人」。

## 链路全景

1. 浏览器插件 `extension/src/sidepanel.tsx` 发 `POST /api/v1/chat/stream`，`agentId` 固定 `null`（永远自动路由）。
2. `ApiController.stream()`（`web/ApiController.java:115`）直接转交 `ChatService.chat()`；注入的 `general` / `routeCopilot` 两个字段（`:24-25, :31-32`）**从未使用**。
3. `ChatService.chat()`（`service/ChatService.java`）：
   - 路由：`AgentOrchestrator.route()` → LLM 8s（`:66`），失败/低置信度则走 `RouterAgent.route()`（**空壳，无条件返回 general**）。
   - 委派：`decideDomain()` → 若领域 Agent 绑子 Agent，LLM/规则选子 Agent（再 8s，`:175`）。
   - 生成：`llm.stream(agent.systemPrompt(), history, enriched)`（`:557`），把 token 直接塞给 SSE。
   - **全程没有任何「调用工具 → 拿到结果 → 再生成」的环节。**
4. `LlmClient`：`service/LlmClient.java:45,47` 模型报错被 `onErrorResume` 转成普通 token「模型请求失败：xxx」下发给前端，并当正常回答存库（`ChatService.java:662`，role=assistant）。

## 断点清单（按严重度）

### P0 — 结构性缺环（导致「不是 Agent」）

**P0-1 工具 / MCP / Skill 零执行**
- 证据：`McpServerService`、`ToolDefinition` / `SkillDefinition` 仅被 Admin Controller 依赖；对 `ChatService` / `AgentOrchestrator` 全文 grep `mcp/tool/skill/functionCall` **零命中**。
- `ChatService.applyResourceSnapshot()`（`:796-797`）只是把 `toolIds` / `skillIds` 写进 `agent_invocation` 快照 → 后台「本次用了哪些工具」是**谎报**。
- 影响：所有工具 / MCP / Skill 配置是「摆设」，用户交互完全无外部行动能力。

**P0-2 插件从不选 Agent**
- 证据：`sidepanel.tsx:1515` 硬编码 `agentId: null`；`GET /api/v1/agents`（`ApiController.java:42-61`）**无任何调用方**。
- 影响：每次对话都强制 autoRoute，用户无法主动选择领域 / 通用 Agent；后台配的 Agent 列表对插件不可见。

**P0-3 模型错误伪装成回复**
- 证据：`LlmClient.stream()` `:45` / `:47`，`onErrorResume(error -> Flux.just("模型请求失败：" + ...))`。
- 影响：报错文本被当正常回答渲染并 `messages.save`（`:662`，role=assistant），invocation 仍标 `COMPLETED` → 污染历史上下文 + 误导用户 / 审计。

### P1 — 体验与可靠性

- **RouterAgent 空壳**：`agent/RouterAgent.java:14-16` 无条件 `return general`。后台显示的「规则兜底路由 / 置信度 0.70」名不副实；管理员配的 `routingRules` 在兜底路径完全失效。
- **超时与串行**：路由 `blockOptional(8s)`（`AgentOrchestrator.java:66`）+ 委派 `blockOptional(8s)`（`:175`）串行，首字最坏 16s；`SseEmitter(120000L)`（`ChatService.java:415`）硬超时且无心跳，长任务易断流。
- **DOMAIN_SUMMARY 吞掉流式**：`ChatService.java:563-567` 在 `DOMAIN_SUMMARY` 模式下不向客户端发 token，等子 Agent 流完后再 `llm.complete()` 二次总结（`:636-639`，最多 30s 阻塞）→ 用户最长 ~30s 看不到任何字。
- **插件不消费 SSE 事件**：`agent_selected` / `delegation_decided` / `context_forwarded` / `message_completed` 前端未使用（无 Agent 切换 UI、无委派进度、无流式中断恢复）。

### P2 — 工程债

- `matchesRule`（`AgentOrchestrator.java:250-255`）用 `contains` 子串匹配，多候选 `findFirst` 而非按 `priority`；易误命中（如「退货」含「货」）。
- 历史固定 `h.limit(20)`（`ChatService.java:254`）且无 token 截断，超长历史撑爆上下文。
- 路由 / 委派 / 动作提案的 JSON 均用 `indexOf('{')` / `lastIndexOf('}')` 解析（`parseProposal` 只找第一个 `}`，嵌套 JSON 必失败）。
- `AgentRegistry` 无缓存（`:20-37`）：每次路由 `allDefinitions()` 全表查询，`enabledDefinitions` / `findEnabled` / `findPublished` 均直连 DB。
- `resolve()`（`AgentOrchestrator.java:99-111`）静默降级到 `general`，禁用 / 不存在的 Agent 不报错。
- `RequestContext` 用 ThreadLocal，但流式回调跑在 Reactor 线程（身份不跨线程，鉴权字段可能丢失）。
- `AbortController` 取消不传导后端，前端点了停止 LLM 仍跑满。

## 推荐演进路线（若要变成「真 Agent」）

1. **P0-1（最关键）**：在 `ChatService` 生成前注入「工具执行层」——解析模型 function-calling，调用 `McpServerService` / 本地工具，把结果回填下一轮 prompt，形成 ReAct 循环；Skill 同理作为可调用的提示词 + 动作包。
2. **P0-2**：插件拉取 `GET /api/v1/agents` 渲染 Agent 选择器，发送真实 `agentId`。
3. **P0-3**：`LlmClient` 错误不应转成 token；改为 SSE `error` 事件，invocation 标 `FAILED`。
4. **P1**：把 `RouterAgent` 接上管理员 `routingRules` 真实兜底；SSE 加心跳；DOMAIN_SUMMARY 改为边流边总结或先吐子 Agent 原文再补总结。
5. **P2**：规则匹配改精确分词 + priority；历史做 token 预算；JSON 改用严格解析；Registry 加 TTL 缓存；取消信号传导后端。

---

## 修复记录（已完成，后端 `mvn test` 12/12 通过、插件 `tsc -b` 通过）

### P0-1 工具 / MCP / Skill 真正可执行 —— 已修

- 新增 `service/ToolExecutor.java`：按 `ToolDefinition.type` 分派执行
  - `MCP` → `McpServerService.callTool()`（新增 `initialize` → 取 `Mcp-Session-Id` → `tools/call`）
  - `BROWSER_PROPOSAL` → 返回 `BROWSER_PROPOSAL:` 前缀交由前端确认
  - 其余 → HTTP 工具（含私网访问开关 `tool.allow-private-network`，默认关闭）
- `ChatService.runReActLoop()`：把「一次 stream」替换为 ReAct 循环
  - 最多 `agent.max-tool-iterations`（默认 5）轮；解析 `{"tool":"...","arguments":{...}}` → 执行 → 结果回填下一轮
  - 工具未找到时把错误作为观察值喂回，避免死循环；达到上限仍以工具调用收尾时不透传原始 JSON
  - 过程通过 SSE `tool_invoked` / `tool_result` 事件外抛，前端渲染为引用块
- Skill 生效：`ConfigurableAgent` 的 `skillIds` 注入技能提示词，并把技能自带 `toolIds` 并入可用工具集
- 工具作用域收窄：`resolveWithin(agentToolIds, name)`，只能调用该 Agent 绑定的工具，防越权

### P0-2 插件可选 Agent —— 已修

- `sidepanel.tsx` 新增 Agent 选择器（拉取 `GET /api/v1/agents`，仅 GENERAL / DOMAIN + 已发布），
  移除硬编码 `agentId: null`，改为 `agentId: selectedAgentId || null`
- 后端 `resolveUserAgent()` 校验：非已发布的通用 / 领域 Agent 直接拒绝

### P0-3 模型错误不再伪装成回复 —— 已修

- `LlmClient.stream()` / `complete()` 移除 `onErrorResume` 吞异常逻辑，异常向上抛
- `ChatService.handleLoopError()` 统一兜底：SSE `error` 事件 + invocation 标 `FAILED`（`MODEL_ERROR`）
- 插件 `error` 事件解析 `{code,message}` JSON 后再展示，不再把原始 JSON 暴露给用户
- `AgentAdminController` / `RouterAdminController` 的 `llm.complete()` 加 try/catch，调试台显式提示失败原因

### P1 —— 已修

- `RouterAgent` 接上管理员 `routingRules`（`keyword => agentId`，支持 `=>` / `->` / `:`），
  命中且 Agent 可用则路由过去，否则回落 `general`；补充 4 个单测覆盖（含 off-by-one 回归）
- SSE 心跳：每 15s 发送 comment 帧，避免代理 / 浏览器空闲断连
- DOMAIN_SUMMARY 改为流式吐出 + 二次总结失败自动降级为子 Agent 原文，不再整轮失败
- `AgentOrchestrator` 候选子 Agent 按 `priority` 排序后再 `findFirst`

### P2 —— 已修

- `matchesRule`：ASCII 关键词按词边界匹配（避免 "ai" 命中 "said"），中文仍按子串，支持 `*通配*`
- 历史窗口：`recentMessages()` 取**最近** N 条（`agent.max-history-messages`，默认 40）；
  原先 `limit(20)` 取的是**最早** 20 条，长会话会丢最新上下文
- 历史 token 预算 `budgetHistory()`（`agent.max-history-tokens`，默认 6000，至少保留最近 4 条）
- JSON 解析：`buildProposal` / `parseToolCall` 改为括号配平扫描（含字符串转义），支持嵌套 `arguments`
- `AgentRegistry` 加 5s TTL 缓存，save / delete 时失效
- `resolve()` 静默降级改为 `LOG.warn` 记录 id 与原因（已停用 / 不存在），问题可定位
- 取消传导：`out.onCompletion` / `onTimeout` 置 `finished`，后台循环每轮检查并提前退出

### 收尾（第二轮，均已处理）

- `RequestContext` 跨线程身份丢失：新增 `currentOrNull()` / `set(Identity)` / `runWith(identity, task)`；
  `ChatService` 在提交工作线程前捕获身份并通过 `runWith` 带入，任务结束后恢复原绑定
  （SseEmitter 返回后请求线程即结束、`JwtAuthFilter` 会 clear，不显式传播则循环内拿不到身份）。
  未采用 `InheritableThreadLocal`：线程池复用会导致身份串号，显式传播可确定性验证。
  新增 `RequestContextTest` 覆盖「跨线程传播」「null 处理」「嵌套恢复」三个场景。
- 插件消费路由 / 委派事件：`Msg` 增加 `agentName` / `delegatedTo`，处理 `agent_selected` /
  `delegation_decided`，并在助手气泡上方渲染 Agent 徽标；`message_completed` 作为兜底——
  若整轮没收到任何 token（如被代理缓冲），用完整内容补齐，避免出现空气泡。
  `context_forwarded` 无展示价值，前端忽略。

### 仍未处理（有意保留）

- `agent_selected` 的 `needsClarification` 仅记录未做交互（暂不打断流式体验）。
- 路由 / 委派阶段的耗时（8s + 8s 串行 blockOptional）未做并行化：属于架构级调整，
  需要把委派决策改为与首次生成流水化，建议单独排期。
