# intra-copilot

浏览器内的页面助手（Chrome/Edge Chromium MV3 + Spring Boot）。

## 启动后端

```powershell
docker compose up -d postgres
cd backend
$env:LLM_API_KEY="your-key"
mvn spring-boot:run
```

后端默认监听 `http://127.0.0.1:8080`，数据存储在 PostgreSQL。复制 `.env.example` 中的数据库、模型和 RAG 配置到环境变量后再启动。

如需迁移旧 SQLite 数据，先启动 PostgreSQL 并让 Flyway 完成建表，再安装 `psycopg[binary]`，执行 `python backend/scripts/migrate-sqlite-to-postgres.py --sqlite backend/intra-copilot.db`。迁移脚本不会修改源文件。

## 构建并加载插件

```powershell
cd extension
npm install
npm run build
```

在 Chrome/Edge 打开扩展管理页，开启“开发者模式”，选择“加载已解压的扩展”，指向 `extension/dist`。点击页面悬浮球打开侧边栏；首次使用需允许当前页面访问权限。

侧边栏右上角“设置”可配置插件启用范围：默认是“仅在手动开启的页面使用”，在需要使用的页面打开侧边栏后，点击“在当前页面开启”；也可以切换为“所有页面开启”。切回手动模式后，未主动开启的页面不会显示悬浮球。

模型密钥只配置在后端环境变量中，插件不会保存或传输密钥。写入页面的点击、填写、跳转动作必须在侧边栏中逐项确认。

## 启动管理端

管理端位于 `admin/`，用于配置 Agent、知识库、工具、Skill 并调试主 Agent 路由：

```powershell
cd admin
npm install
$env:VITE_API_BASE="http://127.0.0.1:8080/api/v1"
npm run dev
```

生产构建使用 `npm run build`，默认访问 `http://127.0.0.1:4174`。管理 API 在无登录 MVP 中仅建议绑定本机或内网地址，并通过 `CORS_ALLOWED_ORIGINS` 限制来源。若管理端使用 Vite 默认端口 4174，请将 `http://localhost:4174,http://127.0.0.1:4174` 加入该变量。

### 管理 API

- `GET/POST/PUT/DELETE /api/v1/admin/agents`：Agent 配置及启用状态。
- `/api/v1/admin/knowledge-bases`：知识库、Markdown/TXT/PDF 文档上传、重建索引和删除。
- `/api/v1/admin/tools`、`/api/v1/admin/skills`：注册 HTTP 工具和 Skill；HTTP 工具仅允许 HTTPS 公网域名。
- `POST /api/v1/admin/router/test`：使用当前配置测试主 Agent 路由。

知识库索引依赖 pgvector 与 Embedding API；未配置 Embedding Key 时文档会标记为 `ERROR`，不会阻塞会话功能。
