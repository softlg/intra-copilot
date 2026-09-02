# intra-copilot

浏览器内的页面诊断与 TMS 操作助手（Chrome/Edge Chromium MV3 + Spring Boot）。

## 启动后端

```powershell
cd backend
$env:LLM_API_KEY="your-key"
mvn spring-boot:run
```

后端默认监听 `http://127.0.0.1:8080`，SQLite 数据文件位于 `backend/intra-copilot.db`。

## 构建并加载插件

```powershell
cd extension
npm install
npm run build
```

在 Chrome/Edge 打开扩展管理页，开启“开发者模式”，选择“加载已解压的扩展”，指向 `extension/dist`。点击页面悬浮球打开侧边栏；首次使用需允许当前页面访问权限。

模型密钥只配置在后端环境变量中，插件不会保存或传输密钥。写入页面的点击、填写、跳转动作必须在侧边栏中逐项确认。
