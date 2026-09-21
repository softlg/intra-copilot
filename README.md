# intra-copilot

浏览器内的页面助手（Chrome/Edge Chromium MV3 + Spring Boot + Spring AI）。

## 后端架构

后端采用模块化单体 + DDD 分层，按 `domain`、`application`、`infrastructure`、`interfaces` 组织，并划分 Agent、Capability、Conversation、Knowledge、Identity、Admin 六个业务上下文。详细目录、依赖规则和新功能落位方式见 [`backend/README.md`](backend/README.md)。

## 启动后端

```powershell
docker compose up -d postgres
cd backend
$env:LLM_API_KEY="your-key"
mvn spring-boot:run
```

后端默认监听 `http://127.0.0.1:8080`，数据存储在 PostgreSQL。复制 `.env.example` 中的数据库、模型和 RAG 配置到环境变量后再启动。

控制台日志会按级别着色：`TRACE` 紫色、`DEBUG` 青色、`INFO` 绿色、`WARN` 黄色、`ERROR` 红色。可通过 `LOG_ANSI_ENABLED=DETECT|ALWAYS|NEVER` 控制 ANSI 颜色输出。

后端模型调用统一通过 Spring AI OpenAI Starter，兼容 OpenAI API 及兼容协议服务。聊天模型使用 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`，Embedding 使用 `EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`；业务 Agent 不直接拼接模型 HTTP 请求。`LLM_BASE_URL`/`EMBEDDING_BASE_URL` 通常填写带 `/v1` 的服务地址（例如 `https://api.openai.com/v1`），路径由 `LLM_COMPLETIONS_PATH`（默认 `/chat/completions`）和 `EMBEDDING_PATH`（默认 `/embeddings`）补充，避免出现 `/v1/v1/...` 导致 404。

图片理解等长请求可通过 `AGENT_LLM_TIMEOUT_SECONDS`（默认 180 秒）调整单次模型调用超时，通过 `AGENT_SSE_TIMEOUT_SECONDS`（默认 600 秒）调整流式连接超时；SSE 超时会自动保持在模型调用超时之上。

如需迁移旧 SQLite 数据，先启动 PostgreSQL 并让 Flyway 完成建表，再安装 `psycopg[binary]`，执行 `python backend/scripts/migrate-sqlite-to-postgres.py --sqlite backend/intra-copilot.db`。迁移脚本不会修改源文件。

## 构建并加载插件

```powershell
cd extension
npm install
npm run build
```

在 Chrome/Edge 打开扩展管理页，开启“开发者模式”，选择“加载已解压的扩展”，指向 `extension/dist`。点击浏览器工具栏中的扩展图标打开侧边栏；启用某个页面时，插件才申请该站点的运行时权限，不再在安装时获得全网站访问权。

侧边栏默认只在打开它的标签页显示，切换到其它标签页时会隐藏，切回原标签页后恢复。侧边栏右上角“设置”中勾选“在所有标签页启用”后，侧边栏会在窗口内的所有标签页持续显示。

模型密钥只配置在后端环境变量中，插件不会保存或传输密钥。写入页面的点击、填写、跳转动作按用户选择的“请求批准 / 帮我批准 / 完全控制”权限执行。

插件默认使用“可视化操作”模式，页面中会显示虚拟光标、目标高亮和操作进度。权限设置还提供“快速执行”“浏览器真实输入”和“系统级输入”：前者不播放动画，后两者分别通过 Chrome Debugger 协议和本机 Native Host 发送可信输入。系统级输入需要额外安装 `native-host/`，且会操作真实鼠标和键盘。

```powershell
.\native-host\install.ps1 -ExtensionId YOUR_EXTENSION_ID
```

## 服务端浏览器 Runtime

需要无人值守或后台执行时，可以使用服务端 Chrome Runtime：

```powershell
$env:BROWSER_SELENIUM_ENABLED="true"
$env:BROWSER_SELENIUM_HEADLESS="true"
$env:BROWSER_SELENIUM_DRIVER_PATH="C:\path\to\chromedriver.exe"
```

任务通过 `/api/v1/browser/tasks` 创建和查询，使用设备令牌鉴权。服务端 Runtime 支持页面观察、点击、输入、下拉、勾选、编辑器写入、等待、验证和提取，并将每一步记录到 `browser_task_event`。

插件和嵌入式 SDK 使用统一的持久化 Runtime 协议：

- `POST /api/v1/browser/runtimes/presence`：上报 Runtime 版本、支持动作和交互模式。
- `POST /api/v1/browser/runtimes/leases`：领取任务与下一条命令，同时续租。
- `POST /api/v1/browser/runtimes/commands/{id}/result`：回传动作结果、页面观察和验证状态。
- `POST /api/v1/browser/runtimes/leases/release`：主动释放任务租约。

任务支持 `allowedOrigins`、幂等键、租约、命令超时和自动过期回收。`allowFallback=true` 时，首选 Runtime 离线后可以回退到其它在线 Runtime；默认不会静默改用服务端浏览器。

并发浏览器任务数由 `BROWSER_RUNTIME_WORKER_THREADS` 控制（默认 4），每个任务仍受最大步骤和超时限制。
后台每 15 秒检查一次异常退出的执行线程；`CREATED`、`QUEUED` 或长时间无心跳的 `RUNNING` 任务会自动重新入队，避免会话永久等待。

## 嵌入式 SDK

`embed/` 提供不依赖浏览器插件的宿主页面 SDK：

```powershell
cd embed
npm install
npm run build
```

宿主页面可以通过 `attach()` 挂载同一套对话、权限和浏览器动作协议，并自动在后台领取 `EMBEDDED` 任务。默认使用 `VISIBLE_VIRTUAL` 交互模式，在宿主页面内显示虚拟光标和操作状态；需要更快执行时可以设置 `interactionMode: "FAST"`。

## 启动管理端

管理端位于 `admin/`，用于配置 Agent、知识库、工具、Skill 并调试主 Agent 路由：

```powershell
cd admin
npm install
$env:VITE_API_BASE="http://127.0.0.1:8080/api/v1"
npm run dev
```

生产构建使用 `npm run build`，默认访问 `http://127.0.0.1:4174`。启动后端时需配置管理员账号：

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="your-password"
# 可选；配置后重启服务不会使已登录会话失效
$env:ADMIN_SESSION_SECRET="long-random-value"
```

管理端使用 `VIEWER`、`EDITOR`、`ADMIN`、`OWNER` 四级角色。读取接口至少需要 `VIEWER`，配置修改至少需要 `EDITOR`，删除和管理管理员账号至少需要 `ADMIN`。除登录、设备注册与公开能力接口外，`/api/v1/**` 默认拒绝匿名访问。

后端默认启用严格安全配置：`ADMIN_PASSWORD` 不能为空或 `admin`，`ADMIN_SESSION_SECRET` 必须显式配置。仅在本机临时开发时可设置 `SECURITY_REQUIRE_SECURE_ADMIN_CONFIG=false`。

插件设备注册使用一次性 challenge 和 RSA 私钥签名。首次注册由服务端生成 `deviceId`；后续公钥轮换必须提供旧私钥签名，不能仅凭已知的 `deviceId` 覆盖公钥。

管理员登录、设备 challenge 和设备注册使用数据库级固定窗口限流，多实例共享同一额度。知识库和聊天附件使用临时文件与流式对象存储，不把大文件整体读入 JVM 堆。

对象存储删除通过 outbox 重试；Trace 事件使用有界队列批量写入；聊天会话使用数据库运行租约，避免同一会话在多实例中并发生成。

STDIO MCP 使用数据库会话租约，只在持有租约的后端实例启动子进程；多实例环境需要为同一 MCP 会话保持粘性路由。

OpenAPI 与 Swagger UI 默认关闭。需要生成客户端或本地调试时设置 `OPENAPI_ENABLED=true`，接口位于 `/api-docs` 和 `/swagger-ui.html`。

### 管理 API

- `POST /api/v1/auth/admin/login`：管理员登录并获取会话令牌。
- `GET /api/v1/auth/admin/session`：校验当前登录状态。
- `GET/POST/PUT/DELETE /api/v1/admin/agents`：Agent 配置及启用状态。
- `/api/v1/admin/knowledge-bases`：知识库、文档上传、重建索引和删除。支持 Markdown、TXT、PDF、DOCX、XLS/XLSX、PPTX、CSV/TSV、HTML；图片和扫描 PDF 需要 OCR。
- `/api/v1/admin/tools`、`/api/v1/admin/skills`：注册 HTTP 工具和 Skill。HTTP 工具默认仅允许 HTTPS 公网地址；`TOOLS_ALLOW_HTTP=true` 可放行 HTTP，`TOOLS_ALLOW_PRIVATE_NETWORK=true` 可显式放行内网或本机地址。DNS 解析在连接阶段再次校验，并拒绝云元数据地址和重定向。
- `/api/v1/admin/mcp-servers`：MCP 服务注册、编辑、启停、删除和健康检查；`POST /{id}/health` 会执行 MCP `initialize` 与 `tools/list`，缓存接口数量、能力和接口详情。
- MCP 写操作至少需要 `ADMIN`。启用 STDIO 时还必须通过 `MCP_STDIO_ALLOWED_COMMANDS` 配置命令白名单，并可设置 `MCP_STDIO_WORKING_DIRECTORY` 限制工作目录。
- `POST /api/v1/admin/router/test`：按插件请求协议测试系统 Agent 路由，支持页面权限、图片附件和领域/子 Agent 委派链路。
- `POST /api/v1/admin/router/attachments`：上传路由测试图片并返回管理端预览地址。

知识库索引依赖 pgvector 与 Embedding API；未配置 Embedding Key 时文档会标记为 `ERROR`，不会阻塞会话功能。

PDF 文本层、Office 表格、CSV/HTML 表格和 Markdown 标题会保留结构化元数据；PDF/Office/PPT 图片可提取并保存。启用 OCR 时需要本机安装 `tesseract` 及对应语言包，然后配置：

```powershell
$env:OCR_ENABLED="true"
$env:OCR_COMMAND="tesseract"
$env:OCR_LANGUAGES="chi_sim+eng"
```

OCR 默认关闭。未启用 OCR 时，扫描 PDF 或独立图片会上传失败或提示“未能提取到可索引文本”。混合检索使用 pgvector 与 PostgreSQL `pg_trgm` 两路候选，再执行融合、去重和相邻分块扩展；重建失败时上一代向量仍可作为检索兜底。
