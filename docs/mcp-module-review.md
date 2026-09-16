# MCP 模块问题评审（后台 / 管理控制台）

评审范围：`backend` 的 `McpServerService` / `McpServerAdminController` / `ToolExecutor(executeMcp)` / `mcp_server` 迁移，以及 `admin` 的 `McpServersPage` / `main.tsx` 中的 MCP 状态与弹窗 / `lib/mcp.ts` / `style.css`。

结论：整体链路（注册 → 发现 → 镜像 `ToolDefinition(type=MCP)` → Agent 调用）是通的，但存在 **1 个会破坏运行时的 P0 缺陷**、若干一致性/性能问题，以及界面上一批"看得到但用不上"的空壳功能。

---

## P0 — 功能缺陷（建议优先修）

### 1. 健康检查失败会清空该服务的全部镜像 Tool

`McpServerService.checkHealth` 在异常分支里只写了状态，`discoveredInterfaces` 仍是 `List.of()`，但方法末尾**无条件**执行 `syncTools(server, discoveredInterfaces)`（`McpServerService.java:230`）。

`syncTools` 的判断是"远端列表里没有的 Tool 就删/禁用"（`:312-326`），空列表即等于"远端什么都不提供"：

- 被 Agent/Skill 引用的 Tool → 被置为 `enabled=false`；
- 未被引用的 Tool → 直接 `deleteById`。

影响：一次网络抖动 / 上游 503，就会让这个 MCP 服务的 Tool 目录整体失效（Agent 的工具调用能力在下一个成功检查前直接消失，最长 `mcp.health-check-interval-ms`=5 分钟）。这是定时任务路径上的常态风险，不是边缘情况。

修复建议：把 `syncTools` 收进 try 分支，只在 `discovery` 成功（或返回了非空列表）时执行；失败时保留上一次成功快照，仅更新 `status/lastError`。

### 2. 修改传输方式/地址后，缓存会话永远不会被逐出

`McpServerService.update` 先执行 `current.setServerUrl(...)` / `current.setTransport(...)`（`:160-161`），随后才计算：

```java
boolean configChanged =
    !Objects.equals(current.getTransport(), value.getTransport().toUpperCase())
        || !Objects.equals(current.getServerUrl(), value.getServerUrl().trim());
```

此时 `current` 已经被赋成新值，两个比较恒等 → `configChanged` **恒为 false**，`:172` 的 `evictSession` 是死代码，注释里写的"立即逐出"并未发生。

影响：改完 URL 后，缓存里的旧 `Mcp-Session-Id` 继续被复用，下一次 `tools/call` 会先失败一次（靠 `invalidate()` 兜底自愈）；STDIO 场景下旧子进程最长还会存活 5 分钟。

修复建议：先把旧值存进局部变量再比较，或改成 `boolean configChanged = !Objects.equals(current.getServerUrl(), value.getServerUrl().trim()) || !Objects.equals(current.getTransport(), value.getTransport().toUpperCase());` 放在赋值之前。

### 3. 前端加载失败被静默吞掉，页面显示"没有 MCP 服务"

`main.tsx:641-647` 的 `loadMcpServers` 用 `.catch(() => setMcpServers([]))`，既不设错误态也不提示，`McpServersPage` 于是渲染空状态（"暂无资源 + 新建"）。

对比 `loadTools`（`main.tsx:630-639`）是会 `setToolsError` 的。结果是：后端 500 / 鉴权失败时，管理员看到的是"一个 MCP 服务都没有"，可能误判成数据被删，甚至重复新建。

---

## P1 — 一致性与性能

### 4. 新建/编辑服务不会自动执行一次发现

`create` 把 `status/interfaceCount/interfacesJson` 重置为初始值（`:141-148`），但从不调用 `discover`。`saveMcpServer`（`main.tsx:772-814`）保存后也只 `loadMcpServers()`。

后果：新建的服务一定是"未检查 / 0 个接口"，Agent 侧也拿不到 Tool，必须人工点一次"检查健康"，或等最长 5 分钟的定时任务。这是最容易被当成"功能不生效"的一点。

建议：`create`/`update`（配置变更时）内联触发一次 `checkHealth`，或前端保存成功后自动调一次 `/health`。

### 5. 失败时接口快照自相矛盾

异常分支只 `setInterfaceCount(0)`（`:219`），没有清理 `interfacesJson` / `capabilitiesJson`。于是详情弹窗会出现：摘要显示"0 个接口"，下面却列出上一次成功发现的接口和输入 Schema，`capabilities` 也是陈旧的。`applied` 状态与展示数据不同源，排查时极易误导。

### 6. 同步逻辑是 O(n²) 的全表扫描

`checkHealth → syncTools` 一轮里：

- `syncTools` 入口一次 `toolRepository.findAll()`（`:289`）；
- 每个远端 Tool 都要调 `uniqueFunctionName`，里面又一次 `toolRepository.findAll()`（`:380-388`）→ n 次全表；
- 收尾 `syncToolEnabledState` 再一次 `findAll`（`:367`）；
- 每个被移除的 Tool 调 `isToolReferenced`，里面是 `agents.findAll()`（`:420`）。

Tool 表稍大（几百行）或某个 MCP 服务暴露上百个 Tool 时，每 5 分钟的定时检查会产生大量重复查询；`delete` 路径（`:182-196`）同样是循环内 `findAll`。建议一次性把 tool/agent/skillBinding 读进内存做 Map 索引。

### 7. 列表接口无分页/无摘要投影

`GET /api/v1/admin/mcp-servers` 直接返回实体列表，包含完整的 `interfacesJson`（每个 Tool 的完整 inputSchema）。列表页只用到 `interfaceCount`，却要为此传输全部 Schema；服务多、Tool 多时响应体明显膨胀。建议列表返回摘要 DTO，详情按 id 取。

### 8. 定时检查缺少节流与并发保护

`scheduledHealthCheck`（`:238-248`）无 `initialDelay`，启动即对所有启用服务串行发现；每个最坏 `mcp.timeout-ms`(8s)。它和手动"检查健康"之间没有互斥，同一服务的两次 `checkHealth` 可并发执行，而 `syncTools` 在会话锁**之外**运行，存在写竞争。

---

## P2 — 传输层细节

- **STDIO 在界面上无法配置**：后端支持（`allow-stdio` 门控），但 `main.tsx:4534-4540` 的 `select` 只有 `STREAMABLE_HTTP` 和 `SSE`；已有的 STDIO 记录编辑时 `select` 会显示空值。
- **STDIO 命令按空白切分**（`:740-746`），带空格/引号的路径、含空格的参数都会解析错，且不支持区分 `command` 与 `args`。
- **SSE 发现固定使用 id 1/2/3**（`:825-861`），且 `initialize` 的 `result` 是从 POST 响应体解析（`:844`）——标准 SSE 服务多为 202 空响应，真实响应走 SSE 流，会导致 `capabilitiesJson` 落成 `{}`。此外 `SseChannel` 每次调用重建（`:822-848`、`:886-943`），比 Streamable HTTP 路径昂贵。
- **认证只支持 `Authorization: Bearer <env>`**（`:1122-1128`、`:651-654`），来源是 `System.getenv`。不支持自定义 header 名、API-Key 类鉴权、也不支持在界面里配置 header 模板。
- **内网访问默认值两边不一致**：`mcp.allow-private-network` 默认 `true`（`application.yml:84`），`tools.allow-private-network` 默认 `false`（`:81`）。MCP 的 SSRF 收紧在默认配置下是关着的，建议至少对齐并写清取舍。
- **无法从后台直接试调 Tool**：Tools 页有 `/test`，MCP 页只有"检查健康"。管理员无法在界面上验证某个 Tool 的入参/返回，只能等 Agent 实际调用。

---

## 界面 / UI 问题

| # | 问题 | 位置 |
|---|---|---|
| 1 | 工具栏形同虚设：只有一句副标题 + "新建"，**没有搜索框、没有状态筛选、没有刷新** | `McpServersPage.tsx:41-46` |
| 2 | `filteredMcpServers = mcpServers`，任何搜索/过滤逻辑都不作用于 MCP 列表（对比 Tools、Hooks 都有各自的 `xxxSearch`） | `main.tsx:2732` |
| 3 | 表单里**没有"启用"开关**：`mcpEnabled` 只被设置从不渲染，新建必然 `enabled=true` | `main.tsx:246, 763, 802` |
| 4 | 状态徽标在同一行渲染两次，其中 heading 里那个被 CSS `display:none` 藏掉，属无效 DOM | `McpServersPage.tsx:73-87` + `style.css:1645-1647` |
| 5 | 时间列未检查时显示 `mcpStatusUnknown`（"未检查"），与"最近检查"表头语义冲突，读起来像状态 | `McpServersPage.tsx:103-106` |
| 6 | 详情弹窗：接口列表只读展示，**不能搜索/过滤**；每个接口的 `inputSchema` 全量 `JSON.stringify` 展开，几十个接口时滚动很长 | `main.tsx:4388-4408` |
| 7 | 删除后"撤销"只重建了 server 行（复用旧 id），**被级联删除的镜像 Tool 不会恢复**，需要等下一次健康检查；且 `createdBy` 会被覆盖为当前操作人 | `main.tsx:861-865` |
| 8 | 删除必须先停用（前端 warning + 后端抛错），但没有"停用并删除"一键路径，两步操作容易卡住 | `main.tsx:836-840` |
| 9 | 弹窗可访问性不齐：错误弹窗有 `aria-labelledby`，详情弹窗与表单弹窗没有；弹窗未做焦点回归（只有 resource 弹窗用了 `resourceDialogTriggerRef`） | `main.tsx:4344-4347, 4484` |
| 10 | i18n 死键：`mcpErrorTooltip` 在 zh/en 都定义了但没有任何引用（错误图标按钮用的是 `mcpErrorDetail` 当 aria-label） | `translations.ts:39, 845` |
| 11 | 列宽/信息密度：操作列 `minmax(310px, 1.8fr)` 过宽，行高 108px，最宽的列放三个按钮，视觉重心偏右且空白多 | `style.css:1603-1605, 1621-1622` |

移动端那套卡片化布局（`style.css:5515-5559`）本身是合理的，不需要动。

---

## 测试缺口

`backend/src/test` 下**没有** `McpServerServiceTest` / `McpServerAdminControllerTest`；`ToolExecutorTest` 只是把 `McpServerService` 当 mock 注入，没有覆盖 MCP 分支。上面 P0/P1 里"失败同步清空工具"、"configChanged 恒 false"这两个都是单测能直接拦住的类型。

建议补：
1. 发现失败时不得删除/禁用镜像 Tool；
2. 修改 `serverUrl` / `transport` 后 `evictSession` 被调用；
3. `syncTools` 的增删改幂等性（同一批接口重复同步不产生新 id）；
4. 创建时重置客户端传入的健康快照字段（防 mass assignment）。

---

## 建议修复顺序

1. P0-1 失败同步清空工具（运行时风险最高）
2. P0-2 `configChanged` 失效；P0-3 前端加载静默失败
3. P1-4 保存后自动发现；P1-5 快照一致性
4. UI：工具栏加搜索 + 状态筛选；表单补启用开关（+ 可选 STDIO）；错误提示走 toast/error 态
5. P1-6/7/8 性能与分页；P2 传输层细节；补测试
