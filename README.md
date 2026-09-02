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
