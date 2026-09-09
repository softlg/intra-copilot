# 知识库维护改进方案

> 适用范围：`backend/src/main/java/com/intra/copilot/service/KnowledgeService.java`、
> `KnowledgeAdminController.java`、`EmbeddingClient.java`、`EmbeddingProfileService.java`、
> `KnowledgeBase / KnowledgeDocument / DocumentChunk` 模型、`V3 / V11 / V18` 迁移，
> 以及 `admin/src/main.tsx` 中的知识库维护页（含 maintenance / qa / retrieval 三个 section）。
>
> 文档版本：v1.0（2026-09-08）
> 前置调研：`admin-ui-audit-2026-09.md`（P0×6 / P1×10 / P2×8 已落地 13 个 commit）+ `agent-pages-redesign.md`。
>
> 配套问题清单见会话上下文「22 个问题」。

---

## 0. 第一性原理：知识库维护的本质

把知识库维护拆成 5 个相互依赖的子问题：

| 子问题 | 当前实现状态 | 生产差距 |
|---|---|---|
| **来源（source）** | HTTP multipart 上传，bytes 留在内存里解析后即丢弃 | 缺"原始文件留底"、缺"二次编辑/重解析"能力 |
| **抽取（extract）** | 只 PDFBox 提文本 + UTF-8 直接读 txt/md | 不支持 Office/HTML/CSV/JSON/EML/图片 OCR |
| **分块（chunk）** | `splitStructured` 单策略 + 1200/200 硬编码 | 不感知文档类型，没有 overlap 质量度量 |
| **嵌入（embed）** | 同步循环 `EmbeddingClient.embed` + 写库 | 无重试、无并发、无进度、无失败收敛 |
| **检索（retrieve）** | pgvector `<=>` 余弦距离 + topK | 无 rerank、无评估、无混合检索优化 |

> **核心结论**：当前是"4 个原子操作的 MVP"，缺 **状态机、任务队列、原始文件、配置化分块、可观测性、运维工具** 6 个生产级组件。下面 6 阶段方案按依赖顺序排开：先把模型和数据搬家，再异步化让维护可控，然后丰富解析能力、运维工具、前端体验、检索质量，最后落地协作与生态。

---

## 1. 设计原则

1. **原始文件与索引解耦**：PDF/Office 原文落盘，DB 只存指针 + hash + 元数据。`knowledge_document.content` 字段不再承担"原文缓存"。
2. **同步拆 → 同步入队 + 异步执行**：`upload` 立即返回 `documentId + status`，worker 在后台跑 parse → chunk → embed。任何阶段可重试。
3. **状态机完整化**：`PENDING → PARSING → CHUNKED → EMBEDDING → READY`，加 `FAILED` / `STALE` / `REPLACED` 三态，所有状态变更落审计表。
4. **可配置化**：分块策略、Embedding 配置、QA 场景、检索参数全部配置化 + 后端持久化，不再 hardcode 也不依赖 localStorage。
5. **可观测**：每一次上传/重建/切换都进 `knowledge_audit_log`；indexing job 有进度百分比；diagnostics 面板把 issue 字符串全部展开给运维看。
6. **演进友好**：embedding profile 切换支持"双写 + 灰度切流"，新维度只需加配置项无需迁移；分块算法可逐文档覆盖而不动其他文档。

---

## 2. 阶段路线图

| 阶段 | 主题 | 工期 | 阻塞项 |
|---|---|---|---|
| **S0 数据搬家** | 原始文件落盘 + 审计字段 + 文档版本表 | 5 天 | — |
| **S1 异步化与可靠性** | 任务队列 + 重试 + 死信 + 状态机完整化 | 7 天 | S0 |
| **S2 解析与分块** | Office/HTML/CSV/JSON/EML/OCR + 分块策略可配置 | 7 天 | S0 |
| **S3 运维工具** | 批量重建 + 维度 dry-run + 诊断面板 + 删除预检 | 5 天 | S1 |
| **S4 前端拆分与体验** | main.tsx 拆分 + QA 后端化 + 进度条 + 状态完整翻译 | 5 天 | S1 |
| **S5 检索质量** | Rerank + 多 base 融合 + 评估集 | 5 天 | S3 |
| **S6 协作与生态** | 审计日志 + 权限分级 + 版本控制 + lock | 5 天 | S3 |
| **合计** | | **39 天** | |

> 工期按"一人开发、含联调 + 单元测试"估算。

---

## 3. 阶段 S0：数据搬家

### S0.1 原始文件落盘

**目标**：把"上传后立即解析"改为"上传后立即存盘 + 入队解析"。

**改动**：

1. **新增 `document_storage` 表**（V21）：

   ```sql
   CREATE TABLE knowledge_document_storage (
     document_id VARCHAR(64) PRIMARY KEY REFERENCES knowledge_document(id) ON DELETE CASCADE,
     storage_backend VARCHAR(16) NOT NULL,    -- 'local' | 's3' | 'minio'
     storage_key VARCHAR(512) NOT NULL,       -- 相对路径或对象 key
     sha256 CHAR(64) NOT NULL,
     byte_size BIGINT NOT NULL,
     uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

2. **新增 `StorageBackend` 接口**（`backend/src/main/java/com/intra/copilot/storage/`）：
   - `LocalStorageBackend`（默认，`${app.upload-dir}/kb/{baseId}/{documentId}{ext}`）
   - 后续可加 `S3StorageBackend`、`MinIOStorageBackend`（不改业务代码）
   - `application.yml` 增加 `app.storage.backend: local`，多 backend 用 profile 切换

3. **`KnowledgeDocument` 模型去掉 `content` 字段**（V21）：
   - 删除列；可选保留到 `knowledge_document_archive`（兜底回滚）
   - `KnowledgeService.upload` 不再 `doc.setContent(...)`
   - reindex 时改用"读 storage 后重解析"

4. **`upload` 接口签名不变，但行为改为**：
   ```java
   public KnowledgeDocument upload(String baseId, MultipartFile file) {
       // 1. 校验（同现在）
       // 2. save -> PENDING
       // 3. storage.store(bytes) -> storageKey
       // 4. knowledge_document_storage.save(...)
       // 5. enqueueJob(documentId, JobType.PARSE)
       // 6. 立即返回 documentId（status=PENDING）
   }
   ```

**验收**：
- 上传 10MB PDF 响应 < 500ms（不解析）
- 进程崩溃后重启，pending 状态的文档能恢复处理
- 同一文件二次上传仍按 hash 去重（已有逻辑保留）

**风险**：
- 删除 `content` 字段会破坏 reindex；`KnowledgeService.reindex` 必须改为读 storage 重新解析
- 迁移需要一次性的 `content → storage` 数据搬运（V21 同时提供 `V21__migrate_existing_content.sql` 把历史 content 写回 storage key 并删除列）
- 已有 ERROR 文档的 content 可能丢失（告知用户重传）

---

### S0.2 审计字段 + 版本表

**目标**：可追溯每个文档的生命周期变更。

**改动**：

1. **V22 增加审计字段**：
   ```sql
   ALTER TABLE knowledge_document
     ADD COLUMN created_by VARCHAR(64),
     ADD COLUMN updated_by VARCHAR(64),
     ADD COLUMN source_url TEXT,        -- 若是同步自外部 URL
     ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

   ALTER TABLE knowledge_base
     ADD COLUMN created_by VARCHAR(64),
     ADD COLUMN updated_by VARCHAR(64);

   ALTER TABLE document_chunk
     ADD COLUMN embedding_model VARCHAR(160),     -- 与 embedding_profile_id 双轨
     ADD COLUMN embedding_dimension INTEGER NOT NULL,
     ADD COLUMN chunk_strategy VARCHAR(32) NOT NULL DEFAULT 'structured';
   ```

2. **新增 `knowledge_audit_log` 表**（V22）：
   ```sql
   CREATE TABLE knowledge_audit_log (
     id VARCHAR(64) PRIMARY KEY,
     knowledge_base_id VARCHAR(64) NOT NULL,
     document_id VARCHAR(64),
     actor VARCHAR(64) NOT NULL,
     action VARCHAR(32) NOT NULL,   -- 'UPLOAD' | 'REINDEX' | 'DELETE_DOC' | 'DELETE_BASE' | 'PROFILE_CHANGE' | 'REBUILD_BASE'
     detail JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX idx_audit_base_time ON knowledge_audit_log(knowledge_base_id, created_at DESC);
   ```

3. **`AuditLogger` 服务**：
   ```java
   public void log(String baseId, String documentId, String actor, String action, Map<String, Object> detail);
   ```

**验收**：
- 任何修改类操作都进 audit log
- 后端 `GET /api/v1/admin/knowledge-bases/{id}/audit-log` 返回分页记录
- admin 端新增「审计日志」抽屉

---

## 4. 阶段 S1：异步化与可靠性

### S1.1 任务队列

**目标**：把 parse / chunk / embed 拆出 HTTP 请求线程。

**改动**：

1. **新增 `indexing_job` 表**（V23）：
   ```sql
   CREATE TABLE indexing_job (
     id VARCHAR(64) PRIMARY KEY,
     document_id VARCHAR(64) NOT NULL REFERENCES knowledge_document(id) ON DELETE CASCADE,
     knowledge_base_id VARCHAR(64) NOT NULL,
     job_type VARCHAR(32) NOT NULL,    -- 'PARSE' | 'CHUNK' | 'EMBED' | 'REINDEX'
     status VARCHAR(16) NOT NULL,       -- 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DEAD'
     progress SMALLINT NOT NULL DEFAULT 0,  -- 0..100
     attempt SMALLINT NOT NULL DEFAULT 0,
     max_attempts SMALLINT NOT NULL DEFAULT 3,
     error TEXT,
     payload JSONB,                    -- 关联参数（如 profile id、新维度等）
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     started_at TIMESTAMPTZ,
     finished_at TIMESTAMPTZ
   );
   CREATE INDEX idx_job_status_created ON indexing_job(status, created_at);
   CREATE INDEX idx_job_doc ON indexing_job(document_id);
   ```

3. **新增 `IndexingJobQueue`（基于表轮询）**：
   - 单实例：`@Scheduled(fixedDelay=500)` 轮询 `status='QUEUED'` 的 job，原子 `UPDATE ... SET status='RUNNING', worker_id=... WHERE status='QUEUED'` 抢占
   - 多实例：每个 worker 有唯一 `worker_id`（UUID hostname hash）；同一时间一个 job 只被一个 worker 抢到
   - 也可以接入 Redis Streams / RabbitMQ，但 V23 阶段优先表轮询，零依赖

4. **`KnowledgeService` 拆方法**：
   ```java
   public class IndexingJobService {
       public String enqueueParse(String documentId);
       public String enqueueReindex(String documentId);
       public String enqueueRebuildBase(String baseId, String profileId);  // 批量重建
       @Scheduled(fixedDelay=500) void poll();
   }
   ```

5. **状态机完整化**：

   ```
   PENDING --(enqueueParse)--> QUEUED
   QUEUED --(worker pickup)--> PARSING
   PARSING --(page done)--> CHUNKING
   CHUNKING --(chunks ready)--> EMBEDDING
   EMBEDDING --(100%)--> READY
   any --(max attempts)--> FAILED
   READY --(reindex enqueued)--> STALE
   ```

   `KnowledgeDocument.status` 枚举对齐这 6 个状态（+ 保留旧的 PENDING/PARSING/INDEXING/READY/ERROR 字符串以兼容迁移期）。

**验收**：
- 上传 100MB PDF 响应 < 1s
- worker 启动后 5s 内能 pick 积压 job
- 杀掉 worker 再启，QUEUED job 不丢
- 同文档多次上传只产生 1 个有效 job（按 `documentId + jobType` 去重）

---

### S1.2 Embedding 调用重试与限流

**改动**：

1. **重试**：`EmbeddingClient.embed` 加重试（指数退避，最多 3 次）：
   ```java
   for (int attempt = 1; attempt <= maxAttempts; attempt++) {
       try { return doEmbed(text, profile); }
       catch (RetryableException e) {
           if (attempt == maxAttempts) throw e;
           sleep(Math.min(30_000, 1000 * (1L << attempt)));
       }
   }
   ```
   区分 `RetryableException`（429 / 5xx / 网络）和 `FatalException`（401 / 维度不匹配），后者直接进 FAILED。

2. **限流**：每 worker 内嵌 token bucket，按 `embedding.providers.{provider}.qps` 配置默认上限（OpenAI 建议 60qps，本地 BGE 200qps）。

3. **并发**：每个 worker 同时跑 N 个 embed（默认 4，可配）；维度切换时 N 自动降到 1 避免 429。

**验收**：
- 模拟 429 重试，job 最终 SUCCEEDED 不进 FAILED
- 限流开启时实际 qps 不超配置

---

### S1.3 失败收敛 + 死信

**改动**：

1. **事务边界**：每个 chunk 的"删除旧 embedding + 插入新 embedding"用单条 UPSERT（已有 `ON CONFLICT`），不再先删后插。
2. **失败收敛**：job 异常时回滚本次产生的所有 chunks：
   ```sql
   -- embedding 表的 ON DELETE CASCADE 已经处理；chunks 在 finally 中按 job_id 清理
   DELETE FROM document_chunk WHERE id IN (SELECT chunk_id FROM job_chunk WHERE job_id = ?);
   ```
3. **死信**：`status='DEAD'` 的 job 进 `indexing_dead_letter` 表，admin 端可"重试单条"或"批量重新入队"。

---

## 5. 阶段 S2：解析与分块升级

### S2.1 多格式支持

**新增解析器**（`backend/src/main/java/com/intra/copilot/parser/`）：

| 扩展名 | 解析器 | 依赖 |
|---|---|---|
| `.md / .txt` | `MarkdownParser` | 内置（现状） |
| `.pdf` | `PdfParser` | PDFBox（现状） |
| `.docx` | `DocxParser` | Apache POI |
| `.xlsx / .xlsm` | `XlsxParser`（按 sheet 分块，sheet 名作为 chunk 元数据） | Apache POI |
| `.pptx` | `PptxParser`（按 slide 分块） | Apache POI |
| `.html / .htm` | `HtmlParser`（Jsoup 抽取正文，去 script/style/nav） | jsoup |
| `.csv` | `CsvParser`（按行分块，header 作为 chunk 元数据） | Apache Commons CSV |
| `.json` | `JsonParser`（按数组元素分块或 JSONPath 表达式） | 内置 |
| `.eml` | `EmlParser`（Jakarta Mail） | jakarta.mail |
| `.png / .jpg / .jpeg` | `ImageOcrParser`（PDFBox 集成 Tesseract 或调用外部 OCR 服务） | tesseract4j |

**改动**：
- V24：扩展白名单
- `ParserRegistry` 按扩展名路由解析器
- `KnowledgeService.upload` 改为 `parserRegistry.parse(filename, bytes)`，返回 `List<PageText>`（页/pageNumber 概念扩展为 sheet/slide/section）

**验收**：
- 10 种格式均能解析成功，提取文字 + 元数据
- HTML 解析去除 nav/footer/script，保留正文

---

### S2.2 分块策略可配置

**目标**：按文档类型与场景分块。

**改动**：

1. **新增 `chunk_strategy` 配置**（`application.yml`）：
   ```yaml
   rag.chunk-strategies:
     structured:        # 现状
       splitter: com.intra.copilot.chunk.StructuredSplitter
     paragraph:         # 按段落 + 段落长度
       splitter: com.intra.copilot.chunk.ParagraphSplitter
       max-chars: 1200
     code-aware:        # 代码块按 ``` 切
       splitter: com.intra.copilot.chunk.CodeAwareSplitter
     csv-row:           # CSV 每行一个 chunk
       splitter: com.intra.copilot.chunk.CsvRowSplitter
   ```

2. **`KnowledgeBase.chunkStrategyId` 字段**（V24），默认 `structured`。
3. **每 chunk 元数据**：保留 `pageNumber`，新增 `section`（heading/path/sheet/row index）。
4. **小文档不分块**：`< 200 字符` 直接 1 个 chunk。

**验收**：
- 同一文档切换策略后 chunk 数 +/− 显著（结构化 vs 段落）
- chunk_strategy 元数据保留，可用于检索过滤

---

## 6. 阶段 S3：运维工具

### S3.1 批量重建

**新增接口**：

```java
POST /api/v1/admin/knowledge-bases/{id}/rebuild
Body: { "profileId": "openai-large-embedding", "fromVersion": "1", "dryRun": false }
Response: { "jobId": "...", "estimatedDocuments": 42 }
```

**行为**：
1. 校验新 profile 存在且启用
2. 检查维度切换：新维度 ≠ 旧维度 → 警告 + 必须 `dryRun=true` 先预演
3. 预演：返回"按新维度重嵌需要 N 次调用、约 X 元、Y 分钟"
4. 真执行：按 base 下所有 READY 文档入队 REINDEX job，串行执行避免 429
5. 期间 `KnowledgeBase.status='REBUILDING'`，检索自动跳过该 base

**验收**：
- 100 文档 base 重建全程可观察进度（按 job 完成数 / 总数）
- 重建失败单个不影响其他文档

---

### S3.2 维度切换 dry-run

**目标**：让用户在不真正重建前评估代价。

**新增接口**：

```java
POST /api/v1/admin/knowledge-bases/{id}/profile-preview
Body: { "profileId": "openai-large-embedding" }
Response: {
  "currentProfile": "system-default-embedding",
  "newProfile": "openai-large-embedding",
  "currentDimension": 1536,
  "newDimension": 3072,
  "documentCount": 42,
  "chunkCount": 1247,
  "estimatedTokens": 380000,
  "estimatedSeconds": 380,
  "estimatedCostUsd": 0.019,
  "warnings": ["Dimension change requires full reindex"]
}
```

**实现**：用新 profile 试调一次 embed（同一段代表性文本），同时按 chunk 数推算总量。

**验收**：运维能"先看再决定"。

---

### S3.3 诊断面板增强

**改动**：

1. **`KnowledgeService.diagnostics` 扩展**（V25 + 后端）：
   - 把 3 个 issue 标签扩展为 8 个：`EMBEDDING_TABLE_MISSING` / `DOCUMENT_INDEXING_ERROR` / `READY_DOCUMENT_WITHOUT_VECTOR` / `STALE_CHUNKS` / `MISSING_AUDIT_LOG` / `DIMENSION_MISMATCH` / `PROFILE_DISABLED` / `STORAGE_BACKEND_OFFLINE`
   - 每个 issue 带 `severity` + `recommendation` 字段

2. **前端 diagnostic 抽屉**：
   - 表格展示 issue
   - "修复"按钮触发对应操作（重建 base / 重试 dead job / 同步审计等）

---

### S3.4 删除预检

**改动**：

1. **`deleteBase` 前**先查统计：`documentCount / chunkCount / embeddingCount / boundAgents`
2. **前端弹窗**显示：

   ```
   确定删除知识库「产品手册」吗？
   - 23 个文档
   - 1,247 个 chunk
   - 0 个 Agent 绑定
   - 最近 7 天内无活动
   此操作不可撤销，所有 chunk 与 embedding 都会被清理。
   [取消] [删除]
   ```

---

## 7. 阶段 S4：前端拆分与体验

### S4.1 main.tsx 拆分

**目标**：把 6239 行的 App 组件拆为按页面/按职责的模块。

**目录**：

```
admin/src/
├── main.tsx               # 仅入口 + Router
├── App.tsx                # 顶层 Layout + Toast/ConfirmDialog Provider
├── routes.tsx             # 路由表
├── pages/
│   ├── agents/
│   │   ├── SystemAgents.tsx
│   │   ├── GeneralAgents.tsx
│   │   ├── DomainAgents.tsx
│   │   ├── SubAgents.tsx
│   │   └── AgentSettings.tsx
│   ├── knowledge/
│   │   ├── KnowledgeList.tsx
│   │   ├── KnowledgeDetail.tsx   # 拆分出 Maintenance / QASettings / Retrieval
│   │   ├── DocumentList.tsx
│   │   └── DiagnosticsPanel.tsx
│   ├── tools/
│   ├── skills/
│   ├── hooks/
│   ├── mcp/
│   ├── ratings/
│   └── router-test/
├── components/            # 已有 9 个 + 新增
├── hooks/
│   ├── useToast.ts
│   ├── useConfirm.ts
│   ├── useResourceLoader.ts
│   └── useKnowledgeBase.ts
└── lib/
    ├── api.ts             # apiFetch 封装
    └── i18n.ts
```

**验收**：
- 每个 page 文件 < 600 行
- 共享 hooks 可被多页复用

---

### S4.2 QA 设置后端持久化

**改动**：

1. **后端 `QASceneSettings` 模型**（V26）：
   ```sql
   CREATE TABLE knowledge_qa_scene (
     id VARCHAR(64) PRIMARY KEY,
     knowledge_base_id VARCHAR(64) NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
     scene VARCHAR(64) NOT NULL,           -- 'default' | 'summary' | 'qa-citation' 等
     top_k INTEGER NOT NULL DEFAULT 5,
     similarity_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.65,
     prompt TEXT,
     updated_at TIMESTAMPTZ NOT NULL,
     UNIQUE (knowledge_base_id, scene)
   );
   ```

2. **`POST/GET/PUT /api/v1/admin/knowledge-bases/{id}/qa-scenes`**
3. **前端去掉 `admin-qa-settings` localStorage**，改为按 base 拉取 + 编辑

**验收**：
- 切浏览器配置不丢
- 多 base 互不串

---

### S4.3 状态机完整翻译 + 进度

**改动**：

1. **i18n 增补 6 态翻译**（与 S1 状态机一致）：
   - `pending / parsing / chunking / embedding / ready / failed / stale / replaced`

2. **进度展示**：
   - 列表页每文档行加 `ProgressBar`（按 indexing_job.progress）
   - 批量上传返回 `jobId`，前端 SSE / 轮询获取进度
   - 失败文档行变红 + 「重试」操作

---

### S4.4 检索对比

**改动**：

1. **`KnowledgeRetriever.Result` 加 `score` 字段**（同时保留 `distance`）
2. **前端 retrieval tab 增强**：
   - topK / threshold 双滑块
   - 文档过滤（多选下拉）
   - 页码过滤（输入页号范围）
   - 结果卡片展示 score + distance，hover 高亮关键词

**验收**：
- 调阈值滑块实时刷新结果（前端去抖 200ms）

---

## 8. 阶段 S5：检索质量

### S5.1 Rerank

**改动**：

1. **新增 `RerankProfile` 模型**（V27）+ 表，类似 `EmbeddingProfile`
2. **检索流程**：粗排 topK=50 → rerank → 精排 topK=10
3. **可选 rerank provider**：
   - `cohere`（api）
   - `bge-reranker-v2-m3`（本地 HTTP）
   - `none`（关闭）

**验收**：检索 P@5 提升可量化（用 S5.3 评估集对比）

---

### S5.2 多 base 融合

**改动**：

1. **当前逻辑**（`KnowledgeService.search`）：每个 base 单独 topK → 按 1/(60+rank) 打散 → 取前 topK
2. **新逻辑**：RRF（Reciprocal Rank Fusion）算法，所有 base 合并 rrf score：
   ```sql
   SELECT document_id, filename, page_number, content, distance,
          1.0 / (60 + row_number() OVER (PARTITION BY knowledge_base_id ORDER BY distance)) AS rrf_score
   FROM ...
   ORDER BY rrf_score DESC
   LIMIT topK
   ```
3. **配置项**：`search.fusion: rrf | linear | max`

---

### S5.3 评估集与质量度量

**改动**：

1. **新增 `knowledge_eval_set` 表**（V27）：
   ```sql
   CREATE TABLE knowledge_eval_set (
     id VARCHAR(64) PRIMARY KEY,
     knowledge_base_id VARCHAR(64) NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
     query VARCHAR(500) NOT NULL,
     expected_document_ids VARCHAR(64)[] NOT NULL,
     expected_chunk_ids VARCHAR(64)[],
     notes TEXT,
     created_at TIMESTAMPTZ
   );
   ```

2. **`POST /api/v1/admin/knowledge-bases/{id}/eval`** 返回 `{p_at_5, r_at_10, mrr, ndcg@10}`
3. **前端**：检索测试 tab 增加「保存为评估用例」「运行评估」按钮

**验收**：可量化"换 embedding 好不好"。

---

## 9. 阶段 S6：协作与生态

### S6.1 审计日志前端

**改动**：
- 知识库详情页加「审计日志」抽屉
- 表格：时间 / 操作人 / 动作 / 详情 JSON
- 过滤：动作类型、时间范围、操作人

---

### S6.2 权限分级

**改动**：

1. **角色**：
   - `KB_ADMIN`（上传/删除/重建）
   - `KB_EDITOR`（上传/编辑文档元数据）
   - `KB_VIEWER`（只读 + 检索测试）
2. **后端 RBAC**：`@PreAuthorize("hasRole('KB_ADMIN')")` 装饰 controller
3. **前端**：admin 端按角色隐藏操作按钮

---

### S6.3 版本控制

**目标**：同一文档可保留多版本。

**改动**：

1. **`KnowledgeDocument` 增加 `supersededById`**（V28），表示"被哪个新版本替换"
2. **上传同名同 hash 不同 version 的文档**：默认覆盖（incremented version）
3. **检索可选**：`includeReplaced=false`（默认不命中被替换版本）

---

### S6.4 编辑锁

**改动**：
- `KnowledgeDocument.lockedBy / lockExpiresAt` 字段
- 5 分钟无心跳自动释放
- admin 列表显示锁状态

---

## 10. 落地建议（按依赖顺序的前 3 周可交付）

| 周 | 交付物 |
|---|---|
| **W1** | S0.1（原始文件落盘 + V21 迁移脚本）、S0.2（审计字段 + log 表） |
| **W2** | S1.1（任务队列 + 状态机完整化）、S1.2（重试） |
| **W3** | S1.3（失败收敛 + 死信）、S3.3（诊断面板增强）、S3.4（删除预检） |

第 3 周末：
- 上传响应 < 1s ✅
- 失败文档可重试 ✅
- 删除前能看到影响范围 ✅
- 诊断面板可一键修复 ✅

---

## 11. 待用户确认事项

1. **存储后端**：默认 `local` 够用吗？还是需要立即支持 S3/MinIO？（若不上云，S3/MinIO 可推迟到 S6）
2. **多格式解析器优先级**：docx/xlsx/pptx 是 P0，html/csv/json/eml 是 P1，OCR 是 P2，可以这样排吗？
3. **Embedding 调用并发**：默认 N=4 够用吗？还是要根据 provider 动态调？
4. **任务队列**：用表轮询（零依赖）还是立即接 Redis Streams（多机部署更友好）？
5. **QA 场景持久化**：是否同时支持"全局场景"（不在 base 下，作用于所有 base）与"base 私有场景"？
6. **权限分级**：是按 admin 角色复用还是新增独立 RBAC？
7. **审计保留期**：默认 90 天自动清理，还是永久保留？

---

## 12. 风险与回滚

| 风险 | 概率 | 缓解 |
|---|---|---|
| 删除 `knowledge_document.content` 字段导致 reindex 失败 | 高 | V21 一次性搬运 + 灰度：先加 `content_archive` 表，reindex 通过新路径验证完成再删 |
| 异步化引入 race condition（同一文档并发 reindex） | 中 | job 抢占 + `documentId + jobType` 唯一约束 |
| 多格式解析器引入新依赖膨胀 | 中 | Apache POI 一个依赖覆盖 docx/xlsx/pptx；jsoup 仅 HTML；OCR 单独拆 profile |
| 切维度时 chunk 数变多导致检索性能下降 | 中 | 切流前 dry-run 推算；先 A/B 双写再切流 |
| main.tsx 拆分引入回归 | 高 | 拆分与行为不变同步进行；每页独立 commit + Playwright 截图回归 |
| QA 后端化影响现有用户 | 中 | 兼容旧 localStorage key 一次性迁移到新 API |

---

## 13. 验收总览

完成全部 6 阶段后：

| 指标 | 当前 | 目标 |
|---|---|---|
| 100MB PDF 上传响应 | ≥ 30s | < 1s |
| 失败率（Embedding 抖动） | 1/10 文档 | < 1/1000（重试收敛）|
| 单文档重建（1 chunk × 100）| 同步卡死 | < 5s 后台完成 |
| 切换 embedding profile | 不可行 | 一键 + dry-run |
| 多格式解析覆盖 | 3 种 | 10+ 种 |
| 检索对比 | 不可量化 | PR/MRR/NDCG 量化 |
| 审计追溯 | 无 | 全量 + UI 可查 |
| 知识库维护 UI 复杂度 | 6239 行单文件 | 每页 < 600 行 |

---

## 14. 实现进度（S0 / S1 / S3 已落地，2026-09-08）

按第 11 节的确认结果执行：范围 S0+S1+S3、`content` 保守归档、表轮询队列、本轮不引入多格式解析依赖。

| 阶段 | 交付 | 位置 |
|---|---|---|
| S0.1 原始文件落盘 | `V21__knowledge_document_storage.sql`、`knowledge_document_content_archive` 归档旧全文、`DocumentStorage` / `LocalDocumentStorage` | `backend/.../storage/`、`model/KnowledgeDocumentStorage.java` |
| S0.2 审计字段 | `V22__knowledge_audit_fields.sql`（created_by/updated_by/source_url/version/parser、chunk 溯源字段）、`knowledge_audit_log` | `service/KnowledgeAuditService.java` |
| S1.1 任务队列 | `V23__indexing_job.sql`（含 `uq_indexing_job_active` 幂等约束、`indexing_dead_letter`） | `service/IndexingJobService.java`、`service/IndexingWorker.java` |
| S1.2 重试与限流 | `EmbeddingClient` 指数退避（429/5xx/网络可重试，401/维度不匹配直接失败）、`EmbeddingRateLimiter` 按 provider QPS | `service/EmbeddingClient.java`、`service/EmbeddingRateLimiter.java` |
| S1.3 失败收敛 | 分块带 `job_id`，全部 embedding 成功后才切换；失败只清理本 job 的分块，旧数据仍可检索 | `service/KnowledgeIndexingService.java` |
| S3.1/S3.2 重建与预演 | `POST /{id}/rebuild {profileId, dryRun}`，返回文档/分块/token/秒/成本估算与告警 | `service/IndexingJobService.java` |
| S3.3 诊断增强 | 8 类 issue，每条带 `severity` + `message` + `recommendation` | `service/KnowledgeService.diagnostics` |
| S3.4 删除预检 | `GET /{id}/delete-impact`（文档/分块/向量/绑定 Agent/最近活动） | `service/KnowledgeService.deleteImpact` |
| 扩展点 | `DocumentParser` + `DocumentParserRegistry`（本轮 text/pdf 两个实现）、`DocumentChunker` 策略 id、`EmbeddingSchema` 维度映射 | `service/DocumentParser.java`、`service/parser/`、`service/DocumentChunker.java` |
| 前端适配 | 状态机全量翻译、诊断 issue 详情、重建预演/执行按钮、上传后轮询进度 | `admin/src/main.tsx`、`src/style.css` |

### 行为变更（需要注意）

- `POST /{id}/documents` 与 `/documents/batch` 现在返回 **202 ACCEPTED**，文档状态为 `QUEUED`，索引在后台执行；批量上传不再因单个文件失败中断，失败项在 `failures` 中返回。
- `POST /documents/{documentId}/reindex` 同样改为入队后立即返回。
- 文档状态新增 `QUEUED / PARSING / CHUNKING / EMBEDDING / STALE / FAILED`（旧的 `INDEXING`、`ERROR` 仍被识别）。
- 上传体积上限从 10 MB 提到 100 MB（`spring.servlet.multipart` 与 `rag.max-document-bytes` 同步调整）。
- 新增配置：`app.upload-dir`、`kb.indexing.{enabled,concurrency,poll-interval-ms,max-attempts}`、`embedding.max-attempts`、`embedding.retry-backoff-ms`、`embedding.providers.*.{qps,cost-per-1k-tokens}`。

### 未做（下一轮）

1. **删除 `knowledge_document.content` 列**：等新重建路径在线上验证通过后再单独出迁移脚本（保守策略）。
2. **S2 多格式解析**：仅落地扩展点，未引入 Apache POI / jsoup。
3. **S4 前端拆分**：main.tsx 仍为单文件；本轮只做知识库相关的最小适配。
4. **S5 检索质量**（rerank / RRF / 评估集）与 **S6 权限、版本控制、编辑锁**。
5. `admin` 前端 `npm run build` 在本轮改动前即存在 18 个 TypeScript 错误（上一轮内联编辑改动未完成：`InlineEditable`、`saveBaseField` 未定义等），本轮改动未新增错误，但构建仍失败，需要先补完那部分工作。

---

_本文档将作为后续实施的基线。每完成一个阶段，更新第 13 节指标，并在 `F:\code\ai\intra-copilot\.workbuddy\memory\YYYY-MM-DD.md` 留 commit 索引。_