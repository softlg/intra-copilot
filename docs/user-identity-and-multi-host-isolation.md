# 用户身份与多宿主隔离方案

> 状态：设计稿，待用户确认后落地实施
> 涉及范围：浏览器插件 / 后续嵌入到外部系统的 Web 组件
> 决策日期：2026-09-08

---

## 1. 背景与目标

### 1.1 现状

- 浏览器插件（extension）作为当前唯一接入方，硬编码调用 `http://localhost:8080/api/v1`
- 后端 `ApiController` 的 `/sessions/*` 接口**完全没有鉴权**，不读任何身份信息
- `conversation` 表**没有 `user_id` / `source` 字段**（V1-V19 全部 19 个迁移均无）
- 后端**没有 SecurityConfig / Filter / Interceptor**
- 插件 manifest 声明了 `<all_urls>` 和 `tabs/scripting/sidePanel/storage/activeTab` 权限，但未使用 `chrome.identity`

**结论**：当前是「单租户、单用户」模型。同一后端被多个用户/多个浏览器使用时，会话数据互相可见、互相污染。

### 1.2 未来形态

| 接入方 | 用户身份来源 | 时间预期 |
|---|---|---|
| 浏览器插件（现在）| `chrome.identity` 拿 Google / 公司 SSO 账号 | 立刻 |
| 嵌入到外部系统的 Web 对话框 | 外部系统自己的登录态 | 后续 |
| 桌面端 / 移动端 / CLI | 宿主应用启动时传入 | 后续 |

### 1.3 目标

1. **接入形态无关**：插件、Web 嵌入、桌面端共用同一套后端 API 和同一套权限模型
2. **宿主决定身份**：我们不存密码、不管账号体系；宿主系统说他是谁，他就是谁
3. **最小信任域**：宿主对「自己用户的真实性」负责；后端只验「这个请求是否被某个被信任的宿主颁了 token」
4. **多宿主天然隔离**：未来多个外部系统各自接入时，用户数据互不串
5. **降级兼容**：插件未登录态有合理的过渡方案

---

## 2. 设计决策（已确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 身份方案 | **A. JWT 联邦** | 解耦最彻底，演化空间最大 |
| 隔离粒度 | **(source, user_id) 复合隔离** | 既保留多宿主隔离能力，又不引入「租户」概念 |
| 插件身份 | **完全自签 JWT（不接外部 OAuth）** | 跳过 Google/SSO 申请周期；插件自管密钥 |
| 插件未登录态 | **设备 UUID 匿名** | 未登录时仍可用，数据按设备隔离 |
| 历史会话 | **登录后不可见** | 历史数据统一归 anonymous，登录账号看不到 |
| admin | **本期不动** | 管理后台维持现状 |
| 实施节奏 | **先出方案文档，确认后再写代码** | 改动面广，先对齐再动手 |

---

## 3. 总体架构

```
┌────────────────────┐
│  宿主 A（浏览器插件）│  chrome.identity → Google token
│  source = extension │
└──────────┬─────────┘
           │ POST /auth/token-exchange { googleToken }
           ▼
┌────────────────────────────────────────────┐
│           会话能力后端                       │
│  ┌──────────────┐    ┌─────────────────┐  │
│  │ TokenIssuer  │◄──▶│  JWKS (公钥)    │  │
│  └──────┬───────┘    └─────────────────┘  │
│         │ 颁发短期 JWT（RS256, 1h）         │
│         │ claims: { iss, sub, source }     │
│         ▼                                  │
│  ┌──────────────────────────────────────┐ │
│  │ JwtAuthFilter (HandlerInterceptor)    │ │
│  │ - 验签                               │ │
│  │ - 注入 Principal{ source, userId }   │ │
│  └──────┬───────────────────────────────┘ │
│         ▼                                  │
│  ┌──────────────────────────────────────┐ │
│  │ ApiController                        │ │
│  │ 强制带 source + userId 过滤数据      │ │
│  └──────┬───────────────────────────────┘ │
└─────────┼──────────────────────────────────┘
          ▼
   conversation(user_id, source, ...)
```

### 3.1 关键组件

| 组件 | 职责 | 文件 |
|---|---|---|
| `TokenIssuer` | 接收宿主系统的 token exchange 请求，颁发短期 JWT | `service/auth/TokenIssuer.java` |
| `JwtVerifier` | 验签 JWT，解析 claims | `service/auth/JwtVerifier.java` |
| `JwtAuthFilter` | Servlet 过滤器，注入 Spring Security Principal | `web/JwtAuthFilter.java` |
| `AuthController` | 暴露 `/auth/token-exchange` 接口 | `web/AuthController.java` |
| `SecurityConfig` | Spring Security 配置（无状态、放行静态、放行 auth 接口） | `config/SecurityConfig.java` |
| `RequestContext` | ThreadLocal 持有当前 source / userId | `service/auth/RequestContext.java` |

### 3.2 哪些接口走鉴权

**走鉴权**（必须带有效 JWT）：
- `/api/v1/sessions*`（会话相关，本期重点）
- `/api/v1/chat/stream`（聊天流）
- `/api/v1/feedback*`（反馈）

**不走鉴权**（保持开放）：
- `/api/v1/agents`（公共能力发现）
- `/api/v1/auth/token-exchange`（换 token 自己）
- `/admin/**`（管理后台，本期不动）
- `/actuator/**`（健康检查）

---

## 4. 数据模型变更

### 4.1 新增迁移 `V20__add_user_identity.sql`

```sql
-- 1) conversation 表加用户归属
ALTER TABLE conversation
  ADD COLUMN source VARCHAR(64) NOT NULL DEFAULT 'extension',
  ADD COLUMN user_id VARCHAR(128) NOT NULL DEFAULT 'anonymous';

-- 历史数据统一打「anonymous」标签（迁移前数据无主）
-- 索引：按 (source, user_id) 查自己的会话
CREATE INDEX idx_conversation_user ON conversation(source, user_id, updated_at DESC);

-- 2) 新增 device_key 表：存设备的公钥 + 绑定 user_id
CREATE TABLE IF NOT EXISTS device_key (
  device_id VARCHAR(64) PRIMARY KEY,         -- 插件生成的 UUID
  public_key_jwk JSON NOT NULL,              -- 设备的 RSA 公钥 (JWK 格式)
  source VARCHAR(64) NOT NULL,               -- 固定 'extension'（本期唯一 source）
  user_id VARCHAR(128) NOT NULL,             -- 默认 anon-{device_id}；可后续绑定真实用户
  enabled BOOLEAN NOT NULL DEFAULT TRUE,     -- 禁用某设备即拒绝其请求
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 不加 user_id/source 到 agent_feedback（本期不动反馈表）
```

### 4.2 Java 模型变更

**`Conversation.java`**：
```java
private String source = "extension";
private String userId = "anonymous";

public String getSource() { return source; }
public void setSource(String v) { source = v; }
public String getUserId() { return userId; }
public void setUserId(String v) { userId = v; }
```

**`ChatService` 接口签名变更**：
```java
public Conversation create()                          → create(String source, String userId)
public List<Conversation> list()                      → list(String source, String userId)
public List<Message> history(String id)               → history(String source, String userId, String id)
public Conversation rename(String id, String title)   → rename(String source, String userId, String id, String title)
public void reorder(List<String> orderedIds)          → reorder(String source, String userId, List<String> orderedIds)
public void delete(String id)                         → delete(String source, String userId, String id)
```

**`ConversationRepository`** 新增方法：
```java
default List<Conversation> findBySourceAndUserId(String source, String userId) {
    return selectList(
        Wrappers.<Conversation>query()
            .eq("source", source)
            .eq("user_id", userId)
            .orderByAsc("sort_order")
            .orderByDesc("updated_at"));
}
```

**`ApiController`** 注入 `RequestContext`，从 ThreadLocal 取 source/userId：
```java
@PostMapping("/sessions")
public Conversation create() {
    return chat.create(ctx.source(), ctx.userId());
}
```

---

## 5. JWT 设计

### 5.1 颁发（自签）

**算法**：RS256（公私钥对，启动时生成，私钥存内存/磁盘；公钥通过 JWKS endpoint 暴露）
**有效期**：1 小时
**Refresh**：客户端在过期前 5 分钟主动调 `/auth/token-exchange` 续期

**Claims**：
```json
{
  "iss": "intra-copilot",
  "sub": "<user_id>",
  "source": "extension" | "system-a" | ...,
  "scope": ["chat:read", "chat:write"],
  "iat": 1694160000,
  "exp": 1694163600,
  "jti": "<uuid>"
}
```

### 5.2 验签

`JwtAuthFilter` 拦截 `/api/v1/*` 请求：
1. 从 `Authorization: Bearer <jwt>` 取 token
2. 验签（用 JWKS 缓存的公钥）
3. 检查 `iss == "intra-copilot"`、`exp > now()`
4. 把 `sub`/`source` 写入 `RequestContext`（ThreadLocal）
5. 放行到 Controller
6. 请求结束后清理 ThreadLocal（防内存泄漏）

### 5.3 Token Exchange

`POST /auth/token-exchange`，请求体：
```json
{
  "source": "extension",
  "externalToken": "<Google OAuth token>",
  "email": "alice@example.com"   // 可选，Google profile 里取
}
```

后端：
1. 根据 `source` 查「外部 Token 校验器」（不同宿主不同实现）
2. 校验通过后，用 `externalToken.sub + email` 生成稳定 `user_id`（如 `sha256(source + ":" + email)`，或直接 email）
3. 颁发 1 小时 JWT 返回
4. **不做账号合并**：同一 email 在不同 source 下视为不同 user

**扩展性**：未来加新宿主只需注册一个新的 `ExternalTokenValidator` bean，不用改 Controller

---

## 6. 前端改造（浏览器插件）

### 6.0 关键设计：插件完全自签 JWT

**整体策略**：插件**不接外部 OAuth**（不调 Google / 公司 SSO），而是自己管理一对非对称密钥：

1. **首次安装**：插件生成 RSA 密钥对（私钥 2048 位），私钥**只存在 `chrome.storage.local`**，永远不上传；公钥 + 设备 UUID + 当前时间戳作为「设备注册信息」通过 `POST /auth/devices/register` 上报给后端
2. **后端**：把公钥存入 `device_key` 表，绑定到 `(device_id, source='extension', user_id)` 三元组
3. **后续请求**：插件用私钥签 JWT（RS256, claims 见 5.1），每次请求带 `Authorization: Bearer <jwt>`
4. **后端验签**：用注册的公钥验签
5. **未登录态处理**：首次注册时 `user_id` 留空 → 后端用 `device_id` 作为 `user_id` 派生（`anon-{device_uuid}`）；用户「登录」其实是后端把 `(device_id, user_id)` 关联到指定 user_id（**本期不实现真正的「登录」——只是用设备 UUID 匿名**）

**为什么这样设计**：
- 跳过 OAuth 申请周期，无需配置 Google client_id / 公司 SSO
- 私钥永远在用户本地，比中心化签发更安全
- 后端只需管「设备 → 公钥 → user_id」映射，逻辑极简
- 未来接外部 OAuth 时**只需替换 TokenIssuer**，前端 token 来源切换即可，签名格式不变

**manifest.json 调整**：
```json
{
  "permissions": [
    "sidePanel", "storage", "activeTab", "scripting", "tabs"
    // 不需要 identity / oauth2 / identity.email
  ]
}
```

**新增 `src/auth.ts`**：
```ts
// 1) 首次启动：生成密钥对 + 注册
let keyPair = await chrome.storage.local.get("keyPair");
if (!keyPair) {
  keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256" },
    true, ["sign", "verify"]
  );
  await chrome.storage.local.set({ keyPair });
  await fetch(API + "/auth/devices/register", {
    method: "POST",
    body: JSON.stringify({
      deviceId: deviceId,                  // 插件生成的 UUID
      publicKey: await exportPublicKeyJwk(keyPair.publicKey),
      source: "extension"
    })
  });
}

// 2) 每次请求：签 JWT + 注入 Authorization
async function authedFetch(path: string, init: RequestInit = {}) {
  const jwt = await signJwt(keyPair.privateKey, {
    sub: deviceId, source: "extension", scope: ["chat:read", "chat:write"]
  });
  return fetch(API + path, {
    ...init,
    headers: { ...init.headers, "Authorization": `Bearer ${jwt}` }
  });
}
```

**sidepanel 改造**：
- 启动时检查 `chrome.storage.local` 是否有 `keyPair` + `deviceId`
- 没有 → 自动生成 + 注册（无需用户操作）
- 所有 fetch 改用 `authedFetch`
- 401 → 提示「设备未注册」+ 自动重试注册流程
- **本期无「登录」概念**——所有数据天然按设备隔离

---

## 7. 嵌入式接入示例（未来）

系统 A 接入「Intra Copilot 对话框」：

```js
// 系统 A 前端
const copilot = new IntraCopilot({
  endpoint: 'https://intra-copilot.example.com/api/v1',
  // 系统 A 后端代理：拿系统 A 自己的用户身份，换 intra-copilot 的 JWT
  getToken: async () => {
    const res = await fetch('/api/copilot/token', {
      credentials: 'include'  // 带系统 A 的 session cookie
    });
    return (await res.json()).token;
  }
});
copilot.mount('#copilot-container');
```

系统 A 后端：
```java
@GetMapping("/api/copilot/token")
public Map<String, String> issueCopilotToken(HttpSession session) {
    User user = session.getCurrentUser();
    return Map.of("token", copilotClient.issueTokenFor(
        "system-a", user.getId()  // source + user_id
    ));
}
```

**这套接口对插件 / 系统 A / 桌面端完全一致**——只换 `getToken` 实现。

---

## 8. 错误码与安全策略

| 错误 | HTTP | 触发条件 | 前端处理 |
|---|---|---|---|
| `MISSING_TOKEN` | 401 | 没带 Authorization | 跳转登录 |
| `INVALID_TOKEN` | 401 | token 验签失败 / 过期 | 自动 refresh；失败则跳转登录 |
| `FORBIDDEN` | 403 | 访问不属于 source+user_id 的资源 | 提示「无权限」+ 不暴露存在性 |
| `SOURCE_MISMATCH` | 403 | 用 A 系统 token 访问 B 系统的资源 | 同上 |

**纵深防御**：
- `chat.delete/rename/history` 强制 `where id=? and source=? and user_id=?`（即使漏了 JwtAuthFilter，数据层也隔离）
- 不要在错误信息里暴露「该 id 是否存在」（避免 ID 枚举）
- 日志里**不打印 token 和 user_id 明文**，只打 hash

---

## 9. 迁移与回滚

### 9.1 数据迁移

V20 加 `source` / `user_id` 列，默认值 `'extension'` / `'anonymous'`。**历史数据全部归到 anonymous 用户**——意味着：
- 老用户登录后**看不到**历史会话（属于 anonymous）
- 社区版/个人用户可以接受这个代价
- 如需保留，可在登录时把 anonymous 下的会话「接管」到新 user_id 下（本期不做，后续做）

### 9.2 回滚

V20 迁移是「加列 + 加索引 + 新表」，都是可逆的。如果方案失败，回滚脚本：
```sql
ALTER TABLE conversation DROP COLUMN source;
ALTER TABLE conversation DROP COLUMN user_id;
DROP INDEX IF EXISTS idx_conversation_user;
DROP TABLE IF EXISTS device_key;
```

### 9.3 灰度

1. 后端先上线 V20 + JwtAuthFilter，**TokenIssuer 不颁发任何 token**（关闭交换端点）→ 老客户端仍可访问（但 JwtAuthFilter 放行老路径）
2. 插件端增加「强制登录」开关，默认关
3. 灰度打开开关，验证隔离正确
4. 全面启用

---

## 10. 改动清单

### 10.1 后端（按提交顺序）

| # | 提交 | 内容 | 预计行数 |
|---|---|---|---|
| 1 | `feat(backend): add source/user_id columns and device_key table` | V20 迁移 + `Conversation` 加字段 + `Repository` 加方法 + `DeviceKey` 实体 | 100 |
| 2 | `feat(backend): add JWT issuance and verification infrastructure` | `TokenIssuer` + `JwtVerifier` + `RequestContext` + 单元测试 | 200 |
| 3 | `feat(backend): add device register endpoint and protect session endpoints with JWT` | `DeviceKeyRepository` + `DeviceRegisterRequest` 接口 + `SecurityConfig` + `JwtAuthFilter` + `AuthController` + `ApiController` 加注入 | 220 |
| 4 | `feat(backend): thread source/user_id through ChatService` | 改 `ChatService` 所有方法签名 | 60 |
| 5 | `chore(backend): deprecate legacy /sessions endpoints without auth` | 文档 + 一周后删除兜底逻辑 | - |

### 10.2 前端（extension）

| # | 提交 | 内容 | 预计行数 |
|---|---|---|---|
| 1 | `feat(extension): add auth module with device key pair and self-signed JWT` | `src/auth.ts`（含 generateKeyPair/register/signJwt/authedFetch）| 150 |
| 2 | `feat(extension): switch all fetches to authedFetch and handle 401 retry` | `sidepanel.tsx` 改动 | 80 |

### 10.3 文档

| # | 内容 |
|---|---|
| 1 | 本方案文档（你正在看的） |
| 2 | 「外部系统接入指南」——给系统 A 团队看的 5 步接入说明 |
| 3 | `agent.md` / `AGENTS.md` 更新安全相关约定 |

---

## 11. 已确认的决策

| 决策点 | 决策 | 备注 |
|---|---|---|
| 未登录态 | **设备 UUID 匿名** | 首次注册时 user_id = `anon-{device_uuid}`；本期无登录流程 |
| 历史会话 | **登录后不可见** | 但本期无登录流程，历史会话永远归 `user_id=anonymous` |
| 身份源 | **不接外部 OAuth** | 插件完全自签 JWT，无 Google/SSO 申请 |
| admin | **本期不动** | 管理后台维持现状，仅会话接口加鉴权 |

> 由于本期没有「登录」概念，决策 1 和 2 在效果上等价于：所有用户（包括老用户）数据按 `(source=extension, user_id=anon-{device_uuid})` 隔离。

---

## 12. 风险与未决事项

| 风险 | 影响 | 缓解 |
|---|---|---|
| 私钥丢失（用户清浏览器数据） | 用户级：丢失所有会话 | 提示用户：私钥丢了=设备身份丢了=数据不可恢复；不做云端备份 |
| 多设备/多浏览器 | 同一用户在不同设备看到不同数据 | 本期设计接受——「设备」就是身份单位，未来加真正的用户登录再合并 |
| 后端公钥表膨胀 | 极低（每设备一行） | 加 `enabled` 字段禁用废弃设备；定期清理 |
| 历史 anonymous 数据访问 | 老用户升级后看不到自己原数据 | 本期接受，登录流程上线后由用户主动接管 |
| 嵌入式接入方绕过 device 注册直接调后端 | 中等 | 后端**默认拒绝无 token 请求**（无兜底） |
| JWT 私钥被恶意扩展获取 | 灾难级（冒用身份） | 私钥仅存 `chrome.storage.local`、不通过网络；扩展本身需受信 |

---

**下一步**：如果你认可本方案，按 10 节的提交清单逐步实现。如果你有想调整的，告诉我对应章节，我会更新文档后再开工。
