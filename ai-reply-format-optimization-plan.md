# AI 回复格式问题诊断与优化计划

> 范围：浏览器插件（extension/）↔ Spring Boot 后端（backend/）的 AI 对话全链路
> 触发现象：插件回复中代码块丢失换行/空格，整段代码挤成一行、以零散内联代码形式渲染（见截图）

---

## 一、结论（TL;DR）

截图里的"代码挤成一行"**不是 Markdown 渲染组件的问题**——插件已经接了 react-markdown + remark-gfm + rehype-highlight，代码块样式、复制按钮、表格滚动都是齐全的。

根因在 **SSE token 通道不保真**：后端把模型输出的裸文本直接塞进 `data:` 字段，前端解析器又按行截取，导致**每个 token 里的换行符丢失、行首空格被吞**。代码 fence（```）因此全部失效，整段代码被 Markdown 当成普通文本 + 内联代码渲染，才出现截图中一行行红橙色碎片。

---

## 二、全链路交互梳理

```
浏览器插件 sidepanel.tsx
   │  POST /api/v1/chat/stream  (sessionId, message, attachmentIds, agentId, pageContext)
   ▼
ChatService.chat()  ── SseEmitter（事件流）
   │  事件类型：
   │  stage                阶段提示（analyzing/routing/generating/tool…）
   │  agent_selected       实际处理的 Agent
   │  delegation_decided   委派子 Agent
   │  token                ★ 正文增量（裸文本，问题所在）
   │  tool_invoked         工具调用（{tool, arguments}）
   │  tool_result          工具结果（{tool, result≤2000字, success}）
   │  action_proposed      浏览器操作提案
   │  message_completed    最终完整回答 {content}
   │  error                错误 {code, message}
   ▼
ReAct 主循环（runReActLoop）
   ├─ LLM 流式输出 → StreamingReplyEmitter.accept(chunk) → emitToken() 逐 delta 转发
   ├─ 原生 function calling 执行 Tool → 结果回灌模型
   └─ 结束后：落库 Message（currentAnswer）→ message_completed → complete()
```

---

## 三、问题清单（按严重度）

### P0-1 SSE token 通道丢字符（截图根因）

**后端** `ChatService.emitToken()` (L1103) / 兜底重放 (L1459)：

```java
out.send(SseEmitter.event().name("token").data(chunk));   // chunk 是裸文本
```

Spring 对 String data 原样写出 `data:` + chunk + `\n`。当 chunk 内含 `\n` 时（`splitForStreaming` 按空白切分、LLM delta 也常含换行），SSE 帧被提前截断。

**前端** `sidepanel.tsx` (L1936–1953) 自制解析器：

```ts
const parts = buffer.split("\n\n");
const data = (part.match(/^data: ?(.+)$/m) || [])[1];
```

三处缺陷叠加：
1. **换行丢失**：chunk 内的 `\n` 被当成 SSE 帧分隔符，换行符本身永远不会进入 content（`(.+)$` 只匹配到行尾）；
2. **行首空格被吞**：`data: ?` 里的 ` ?` 本意是兼容 `data: ` 格式，但 Spring 写出的是 `data:` 无空格，于是**每个以空格开头的模型 delta 都被吃掉第一个空格**——这就是 `fromdataclassesimportdataclass` 的直接原因；
3. **多行内容截断**：跨行 chunk 只有第一行有 `data:` 前缀，后续行被正则忽略，存在内容丢失。

后果：代码块 fence 失效 → react-markdown 把整段代码当正文渲染 → 截图现象。

### P0-2 message_completed 兜底不纠偏

`ChatService` L1471 发送权威完整内容 `{content: currentAnswer}`（含正确换行），但前端 L1994 只在**本地一个 token 都没收到**时才采用它：

```ts
patchAssistantMsg((last) =>
  last.content ? { stage: undefined } : { content: completed.content, ... });
```

本地被损坏的内容没有机会被服务端权威内容修复。这是最低成本的"救命"修复点：改成无条件替换即可立即纠偏（代价是完成瞬间重渲染一次）。

### P1-3 工具调用痕迹混入正文，且与服务端不一致

前端 `appendToolLine()`（L2048–2066）把 `> 调用工具 \`x\`` 和工具结果（≤2000 字符预览）**拼进消息 content**。问题：
- 后端落库的 `Message.content = currentAnswer` 不含这些痕迹 → **UI 与历史记录不一致**，刷新/重进会话后工具痕迹全部消失；
- 工具结果以代码块怼在答案中间，长 JSON 预览干扰阅读正文；
- 追加内容会打断正在流式输出的代码 fence（在 fence 未闭合时插入 `> ...` 文本，Markdown 结构错乱）。

### P1-4 前端补丁式格式修复，治标不治本

`decodeAssistantEscapes()` + `normalizeAssistantMarkdown()`（L486–522）用十几条正则给模型输出打补丁（字面 `\n`、`###标题` 缺空格、列表前缺换行等）。这些 hack：
- 对"代码 fence 内被破坏的内容"无能为力（fence 被排除在处理外）；
- 正则链复杂、相互影响，是未来回归的高危区。

根因一半在 prompt：system prompt 未对输出格式做约束（fenced code 必须独占一行且带语言、标题/列表前后空行等）。

### P2-5 疑似重复发送

截图里同一句"生成应付账单的函数和代码是什么"出现两条用户消息。`send()` 有 `busy` 守卫，但 `busy` 是异步 state，**连续两次点击在同一渲染周期内都能通过守卫**（`setBusy(true)` 尚未生效）。应改用 `busyRef` 同步判断。

### P2-6 流式渲染性能与滚动体验

- 每 token 触发一次 `setMsgs` → 整条消息全量 re-render（react-markdown + highlight 对长回复开销大），长代码回复时明显卡顿；
- `useEffect([msgs])` 无条件 `scrollTo(bottom)`，用户往上翻阅时会被强行拽回底部；
- 流式中途的半截代码块每次重渲染都重新 highlight，浪费且闪烁。

### P2-7 停止/错误文案混入正文

`markGenerationStopped/Failed` 把 "已停止生成"、错误信息以 `content + "\n\n已停止生成"` 追加进消息文本，Markdown 渲染后与正文混在一起，且复制全文时会把提示语一并复制。应作为消息独立状态（badge）展示。

---

## 四、优化计划（四个阶段，可独立交付）

### Phase 1（P0，数据保真）— 预计 0.5~1 天

**1.1 后端：token 事件统一 JSON 封装**

```java
// emitToken / 兜底重放统一改为：
out.send(SseEmitter.event().name("token")
        .data(Map.of("text", chunk)));   // Jackson 序列化，任意字符安全
```

Jackson 会把 `\n`、空格、引号全部正确转义为合法单行 JSON，从根上消除 SSE 帧被内容破坏的问题。`message_completed` 已是 Map，天然一致。

**1.2 前端：重写 SSE 解析器（标准化）**

- 事件解析改为标准实现：一个事件内**所有 `data:` 行按 `\n` join**（对齐 EventSource 规范），彻底移除 ` ?` 吃空格的正则；
- `token` 事件 payload `JSON.parse` 后取 `.text`；解析失败回退按裸文本处理（兼容旧后端）；
- `message_completed` **无条件替换**本地累积 content（修复 P0-2），替换前不重置滚动位置。

**1.3 验证**
- 后端：新增 SSE framing 单测（chunk 含换行/空格/中文/emoji/fence，断言拼回结果与原文逐字符一致）；
- 前端：`npm run build` + 手动验证长代码回复、表格、多轮对话、停止生成、message_completed 纠偏。

### Phase 2（P1，结构一致性）— 预计 1 天

**2.1 工具痕迹改为结构化渲染，不进 content**
- 前端 `Msg` 增加 `toolTrace: {tool, result, success, at}[]`，`tool_invoked/tool_result` 事件写入该数组而非 content；
- 渲染为消息底部独立的"执行过程"折叠区（默认折叠，点击展开时间线），样式复用 code-block；
- 历史会话：后端 `/sessions/{id}/messages` 补充返回工具事件（可从 AgentInvocationEvent / TraceRecorder 记录读取），保证刷新后 UI 与实时一致。

**2.2 Prompt 层输出规范（治本）**
- 在 GeneralAgent / Domain Agent 的 system prompt 中追加输出格式约定：代码必须用 fenced block 且标注语言、fence 独占一行、标题 `#` 后加空格、正文用列表/段落组织；
- `normalizeAssistantMarkdown` 保留但降级为最后兜底，并补注释说明"仅处理无 fence 区域"。

### Phase 3（P2，显示体验）— 预计 1 天

**3.1 流式渲染性能**
- token 到达先写入 buffer，`requestAnimationFrame`/80ms throttle 批量 flush 到 state；
- 流式期间对未完成消息使用轻量渲染（纯文本 + 简单 fence 识别），`message_completed` 后一次性走完整 markdown + highlight；
- 长代码块（>200 行）默认折叠，展示前 30 行 + "展开"按钮。

**3.2 滚动策略**
- 记录用户滚动位置，仅当处于底部附近（距底 < 80px）时才跟随新 token 自动滚动；提供"回到底部"悬浮按钮。

**3.3 状态与正文解耦**
- "已停止生成"/错误提示改为消息对象的 `status` 字段，渲染为消息底部独立 badge，不进 content；
- 复制全文时只复制 content 本身。

**3.4 防重复发送**
- `busyRef = useRef(false)` 同步守卫，`send()` 入口即置位，finally 释放。

### Phase 4（收尾）

- 回归清单：代码块（含无语言 fence）、表格、行内代码、链接、图片、工具调用展示、停止/超时/错误、重试、历史加载、DOMAIN_SUMMARY 二次总结路径（走 `splitForStreaming` 重放）；
- 按 AGENTS.md 约定分模块提交：`fix(extension): preserve SSE token fidelity in chat stream`、`fix(backend): json-encode SSE token payloads`、`feat(extension): structured tool trace panel` 等；
- 提交前验证：`mvn test`、`npm run format:check`、`npx tsc --noEmit`、`npm run build`。

---

## 五、风险与兼容

- 前后端 token 格式改动需**同版本发布**：保留前端裸文本回退（1.2），后端 JSON 化后旧插件也能按回退路径工作（JSON 字符串被当文本显示会带引号——如需完全兼容旧插件，可改为后端把 chunk 按 SSE 规范拆成多个 `data:` 行，前端只需修 ` ?` 与多行 join，两点均做最稳）；
- `message_completed` 无条件替换会覆盖用户中途点"停止"的内容——替换前需判断 `stopped` 状态；
- normalizeAssistantMarkdown 收缩后，个别模型退化输出可能回退到旧瑕疵，通过 prompt 约束 + 观察反馈（已有 FORMAT_UI 反馈渠道）跟踪。
