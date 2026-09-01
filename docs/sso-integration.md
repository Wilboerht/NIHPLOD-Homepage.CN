# SSO 子项目接入指�?

NIHPLOD 统一认证中心 OAuth 2.0 接入文档�? 分钟快速接入，安全省心�?

## 前置条件

1. �?[管理后台](/admin/oauth-clients) 注册 OAuth Client
2. 记录 `clientId`；浏览器�?SPA（Public Client�?*不需�?* `clientSecret`，BFF / Next.js �?Confidential Client 需�?
3. 配置至少一�?`redirect_uri`（回�?URL�?

## 快速开�?

### 1. 安装 SDK

```bash
npm install @nihplod/sso-sdk
```

### 2. 初始�?

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

const sso = new SsoClient({
  clientId: "your-client-id",           // 从管理后台获�?
  redirectUri: "https://yourapp.com/callback",
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile phone",       // 按需请求
});
```

### 3. 发起登录

```typescript
// 跳转�?SSO 登录�?
await sso.login();
// 或指定登录后返回地址
await sso.login("/dashboard");
```

### 4. 处理回调

在回调页�?URL（如 `/callback`）中�?

```typescript
// 解析回调 URL 并交�?token
const tokenData = await sso.handleCallback(window.location.href);

// 获取用户信息
const user = await sso.getUserInfo();
console.log(user.nickname); // "张三"
```

### 5. 检查登录状�?

```typescript
if (sso.isAuthenticated()) {
  // 已登�?
}
```

### 6. 登出

```typescript
// 清除本地 token
await sso.logout();
// 同时登出 SSO 中心
await sso.logout(true);
```

---

## Client 类型选择

管理后台创建 Client 时必须选择应用类型，这决定�?token 端点的认证方式�?

### Confidential Client（默认）

适用场景：Next.js App Router、BFF、服务端应用、桌面端原生应用�?*拥有可信后端**的项目�?

- 创建时勾�?**Confidential Client**
- 必须安全保存 `clientSecret`，仅在后端使�?
- Token 端点需要携�?`client_id` + `client_secret`
- 后端推荐通过 Introspection 端点�?RS256 + JWKS 验证 access_token

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

// 仅在服务端构�?SsoClient 时使�?clientSecret
const sso = new SsoClient({
  clientId: "your-client-id",
  clientSecret: process.env.SSO_CLIENT_SECRET, // 不可泄露到前�?
  redirectUri: "https://yourapp.com/api/auth/callback",
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile",
});
```

### Public Client

适用场景：React SPA、Vue SPA、移动端 H5、桌面端 Electron �?*无可信后�?*的项目�?

- 创建时勾�?**Public Client**
- **不需要也不应该传�?clientSecret**；前端代码中暴露 clientSecret 属于安全事故
- 依赖 PKCE S256 保护授权码流�?
- token 端点只传 `client_id`，不�?`client_secret`

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

// 浏览器端 SPA：不�?clientSecret
const sso = new SsoClient({
  clientId: "your-client-id",
  redirectUri: "https://yourapp.com/callback",
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile",
});
```

### 类型选错怎么办？

可在 [管理后台](/admin/oauth-clients) 编辑 Client 切换类型。切换后�?

- Confidential �?Public：停止使�?clientSecret，前�?后端配置同步移除 secret
- Public �?Confidential：需要立即轮换密钥并安全保存新生成的 clientSecret，旧 Public 配置不再能刷�?token

---

## React 集成

### Provider 方式

```tsx
import { SsoProvider, useSso, CallbackPage } from "@nihplod/sso-sdk/react";

function App() {
  return (
    <SsoProvider
      config={{
        clientId: "your-client-id",
        // 浏览器端 SPA �?Public Client，无需 clientSecret
        redirectUri: "https://yourapp.com/callback",
        ssoBaseUrl: "https://nihplod.cn",
        scopes: "openid profile",
      }}
    >
      <Router>
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Home />} />
      </Router>
    </SsoProvider>
  );
}
```

### useSso Hook

```tsx
function Home() {
  const { user, isAuthenticated, isLoading, login, logout } = useSso();

  if (isLoading) return <div>加载�?..</div>;

  if (!isAuthenticated) {
    return <button onClick={() => login()}>使用 NIHPLOD 账号登录</button>;
  }

  return (
    <div>
      <p>欢迎, {user?.nickname}</p>
      <button onClick={() => logout()}>登出</button>
    </div>
  );
}
```

### 路由保护

```tsx
import { RequireAuth, withAuth } from "@nihplod/sso-sdk/react";

// 方式一：组件包�?
function Dashboard() {
  return (
    <RequireAuth>
      <SecretContent />
    </RequireAuth>
  );
}

// 方式二：HOC
function ProfilePage() {
  return <div>个人中心</div>;
}
export default withAuth(ProfilePage);
```

---

## Next.js 集成

### Middleware 方式（全站保护）

```typescript
// src/middleware.ts
import { createSsoMiddleware } from "@nihplod/sso-sdk/next";

export const middleware = createSsoMiddleware({
  clientId: process.env.SSO_CLIENT_ID!,
  // Confidential Client（BFF/Next.js）建议传�?clientSecret
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "https://yourapp.com/api/auth/callback",
  publicPaths: ["/", "/public", "/api/auth/logout"], // 不需要登录的路径
  // ⚠️ 校验强度说明�?
  // - validateSsoCookie 默认�?true：对主站 SSO 会话 Cookie（__Host-user_token）会调用
  //   Introspection 端点二次验证（每请求一次网络调用，�?30s 进程内缓存）�?
  // - 显式设置 validateSsoCookie: false 可降为仅检�?Cookie 存在性（低延迟）�?
  //   但这只能�?未登录访�?，不能防伪�?已撤销�?Cookie�?
  // - 对子项目自身�?access_token Cookie（回�?handler 写入的）始终会做 Introspection 校验�?
  // validateSsoCookie: false,
  // 本地 HTTP 开发（http://localhost）需开�?insecureLocalDev（middleware/callback/logout
  // 三处同时设置），否则浏览器拒绝写�?Secure Cookie，middleware 会永远判定未登录�?
  // 反复跳转 SSO（详见下方说明）。生产严禁启用�?
  // insecureLocalDev: true,
});

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)", "/api/auth/:path*"],
};
```

> **Token 过期后的预期行为**：Middleware **不会刷新 token**。当 access_token Cookie 过期
> �?Introspection 判定失效时，Middleware 会清除该 Cookie 并重定向�?`/api/oauth/authorize`�?
> 由于用户在主站仍持有 SSO 会话，authorize 端点会立即携带新授权�?302 回来（silent re-auth），
> 回调 handler 重新写入 Cookie —�?用户通常只感知到一次快速跳转，无需任何额外处理�?

### 回调 Route Handler

```typescript
// src/app/api/auth/callback/route.ts
import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";

export const runtime = "nodejs";

export const GET = createCallbackRouteHandler({
  clientId: process.env.SSO_CLIENT_ID!,
  // Confidential Client 必须传入 clientSecret；Public Client 省略
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "https://yourapp.com/api/auth/callback",
});
```

### 登出 Route Handler

```typescript
// src/app/api/auth/logout/route.ts
import { createLogoutRouteHandler } from "@nihplod/sso-sdk/next";

export const runtime = "nodejs";

const logoutHandler = createLogoutRouteHandler({
  clientId: process.env.SSO_CLIENT_ID!,
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "https://yourapp.com/api/auth/callback",
  postLogoutRedirectUri: process.env.SSO_POST_LOGOUT_REDIRECT_URI || "https://yourapp.com/",
  redirectToSso: true,
});

export const GET = logoutHandler;  // 兼容 OIDC RP-Initiated Logout（GET�?
export const POST = logoutHandler; // UI 层推荐用 POST 触发，避�?GET 被跨站请求滥用（CSRF�?
```

> ⚠️ 本地开发使�?`http://localhost` 时，浏览器会拒绝 `Secure` Cookie——且 `__Host-`/`__Secure-` 前缀�?Cookie 缺少 `Secure` 属性时会被直接拒写（Chrome/Edge/Firefox 均强制；部分浏览器把 localhost 视为 secure context 而接受普�?`Secure` Cookie，但任何浏览器都不会接受无前缀要求却缺 Secure 的前缀 Cookie）�?*后果**：登录回调看似成功，�?Cookie 根本写不进去，Middleware 永远判定未登录，于是反复跳转 SSO 授权页形成无限重定向�?
>
> 解决办法（二选一）：
> 1. �?`createSsoMiddleware` / `createCallbackRouteHandler` / `createLogoutRouteHandler` 三处同时设置 `insecureLocalDev: true`（关�?Secure 并去除前缀，启动时打印告警�?*生产必须移除**）；
> 2. 或手动绕过：�?`.env.local` 使用 HTTPS 地址（如 `next dev --experimental-https`），或自行覆�?`accessTokenCookieName` 等配置为无前缀名称并自行处�?Secure 属性�?

---

## OAuth 流程详解

```
 子项�?(SPA/Next.js)                    NIHPLOD SSO 中心
 ─────────────────                        ───────────────
 1. sso.login()
    生成 PKCE verifier + state
    302 �?/api/oauth/authorize ──────�?2. 检查用户登录状�?
                                         3. 未登�?�?302 �?/login
                                         4. 用户登录
                                         5. 展示 consent �?
                                         6. 用户确认授权
    8. 302 �?redirect_uri?code=xxx  ←── 7. 302 返回 auth code
    9. sso.handleCallback()
       校验 state
       �?code + verifier �?token
       POST /api/oauth/token ─────────�?10. 验证 code + PKCE
         ←── access_token +            11. 签发 token
             refresh_token + id_token
```

### OIDC Discovery

- 标准路径：`{issuer}/.well-known/openid-configuration`（第三方 OIDC 库填 issuer 即可自动发现�?
- 兼容路径：`{issuer}/api/oauth/.well-known/openid-configuration`（内容完全一致，供存量接入继续使用）

---

## 安全最佳实�?

### PKCE（强制启用）

SDK 与服务端均强制使�?PKCE S256。浏览器�?SPA（Public Client）不�?client_secret�?
完全依赖 PKCE 防止授权码被截获。code_verifier 使用 `crypto.getRandomValues` 生成�?
code_challenge 通过 SHA-256 哈希计算。回调时 SDK 自动完成 verifier 校验�?

### State 参数（CSRF 防护�?

每次登录请求自动生成 32 字节随机 state，回调时严格比对。开发者无需手动处理�?

⚠️ 服务端对 state 有强制长度约束：**32�?12 字符**（比 RFC 6749 更严格）。SDK 生成�?state 天然满足；若你自行实现授权请求而未使用 SDK，必须发送足够长度的 state，否�?`/api/oauth/authorize` 会回�?`invalid_request`�?

### Token 存储策略

- **token 默认存储�?sessionStorage**（标签页级持久化）：登录回调的整页跳转和页面刷新后登录态保留，关闭标签页即自动清除，且不跨 Tab 共享，缩小了 XSS 窃取 refresh_token 的暴露面；SSR/隐私模式写入失败时降级为内存（此时刷新后需重新授权�?
- **PKCE verifier / state / return_url 等临时数据存储在 sessionStorage**（按标签页隔离），因此授权跳转与回调必须在同一标签页完�?
- 需要多 Tab 间同�?token 时，必须**显式**注入 localStorage 适配器（见下�?如何切换 Token 存储方式"）；⚠️ persist �?localStorage 会让 refresh_token 明文落盘且长期保留，仅建议在 BFF/Confidential Client 场景使用
- Next.js（Middleware + Route Handler）方式将 token 存入 httpOnly Secure cookie，浏览器 JS 无法读取

### redirect_uri 规范

- 必须与注册时完全一致（精确匹配），包括协议、域名、端口、路�?
- 仅允�?HTTPS（生产环境）
- 建议使用 `/api/auth/callback` 等专用路�?

### Scope 最小权�?

- `openid` �?仅返回用�?ID
- `profile` �?昵称、头�?
- `phone` �?手机号（脱敏�?
- `membership` �?会员等级、积�?
- `birthday` �?生日（ISO 8601 格式，未设置时为 `null`�?

示例：商城项�?`"openid profile phone"`，论坛项�?`"openid profile"`

> ⚠️ userinfo 会同时返回两个手机号 claim：OIDC 标准�?`phone_number` 与兼容保留的 `phone`（两者内容一致，�?*脱敏**，如 `138****8000`）。新接入的子项目请使�?`phone_number`；无法通过 SSO 获取明文手机号。id_token 中的手机�?claim 仍为 `phone`�?

### Token 刷新

- access_token 有效�?15 分钟
- SDK 自动在过期前 60 秒静默刷�?
- 刷新使用互斥锁防止并�?
- refresh_token 采用原子轮换（旧 token 立即作废�?
- **Refresh Token 所有权校验**：OAuth 场景�?refresh token 会携�?`client_id` �?`scope` 声明�?
  `/api/oauth/token` �?refresh 流程中严格校�?token 归属�?client 与请求方一致，
  防止子项�?A �?refresh token 被拿到子项目 B 使用

### ID Token 验证

SDK �?`handleCallback` �?Next.js 回调 handler 中会自动验证 ID Token（`iss / aud / exp / sub`、签名、`at_hash`）：

- ID Token **必须使用 RS256 签名**。SDK 通过 `/api/oauth/jwks` 拉取公钥完成签名验证�?
- **SDK 一律拒�?HS256 签名�?ID Token**（对称密钥无法安全分发给 Public Client / BFF�?
  拒绝时抛�?`id_token_hs256_unsupported` 错误）。因此主�?*必须**配置 RS256 密钥对，
  否则所有子项目回调都会失败�?

主站生成 RS256 密钥�?

```bash
npx tsx scripts/generate-oauth-rs256-keys.ts
```

脚本会直接输�?`\n` 转义的单�?`.env` 格式，将 `JWT_ID_TOKEN_PRIVATE_KEY` / `JWT_ID_TOKEN_PUBLIC_KEY`
（以及同时生成的 access_token / logout_token 密钥对）写入 `.env.local` 后重启应用即可生效�?

### 授权错误回传

�?`/api/oauth/authorize` 已经识别出合法的 `client_id` + `redirect_uri`�?
但其他参数（scope、PKCE、state、response_type 等）校验失败时，
SSO 中心不会直接返回 JSON 400，而是�?OAuth 2.0 规范 302 重定向到 `redirect_uri?error=...&error_description=...&state=...`�?
子项目回调处理必须同时检�?`code` �?`error` 参数�?

### 登录页取消（返回）行�?

用户�?SSO 登录页点�?返回"按钮时，SSO 中心会取消本次授权（而非回主站首页或死循环重定向）：
`GET /api/oauth/cancel` 校验 `client_id` / `redirect_uri` 归属后，302 回传
`redirect_uri?error=access_denied&error_description=用户取消了登�?state=...&iss=...`（弹窗登录额外透传 `popup_nonce`）�?
子项�?`handleCallback` 会解�?`error` 参数并抛错，回调页可展示"已取消登�?�?
因此子项目无需为登录页返回按钮做特殊处理，但应保证回调页对 `error` 分支有友好提示�?

### 弹窗登录（Popup�?

SPA 场景可使�?`sso.loginPopup()` 在小窗口中完成登录，主页面不丢失状态（适合表单填写中途登录等场景）：

```typescript
try {
  const tokenData = await sso.loginPopup({ returnUrl: "/dashboard" });
} catch (err) {
  if (err instanceof SsoError && err.code === "popup_blocked") {
    await sso.login("/dashboard"); // 弹窗被拦截，回退到整页跳�?
  }
}
```

约束�?

- 回调路由必须渲染 `<CallbackPage />`（`@nihplod/sso-sdk/react`）：它检�?`window.opener` 并通过 postMessage 把回�?URL 回传主窗口，由主窗口完成 token 交换�?
- 回调页与主页面必须同 origin（postMessage 会校验来�?origin 与一次�?`popup_nonce`，伪造消息会被丢弃）�?
- 移动浏览�?/ 严格弹窗策略下建议始终准�?`popup_blocked` 回退路径�?

### 嵌入（iframe）限�?

SSO 中心的登录、授权确认等页面带有 CSP `frame-ancestors 'self'`�?*禁止被跨�?iframe 嵌入**（防点击劫持）�?
不要�?iframe 嵌入 SSO 登录页实�?页内登录"——浏览器会直接拒绝渲染�?
需要不打断当前页面上下文的场景请使用上�?popup 方式�?

---

## Cookie 策略

### Session 共享

SSO 中心使用 `__Host-user_token` Cookie 维持用户登录状态：

| 属�?| �?| 说明 |
|------|-----|------|
| `HttpOnly` | `true` | JS 不可读取 |
| `Secure` | `true` | �?HTTPS |
| `SameSite` | `Lax` | 顶级导航自动携带 |
| `Path` | `/` | 全站可用 |
| `__Host-` 前缀 | �?| 强制 Secure + Path=/ |

子域名间（如 `advisor.nihplod.cn`→`nihplod.cn`）的顶级导航会携�?Cookie，用户无需重复登录�?

## 跨域（CORS�?

Token/UserInfo/Introspect 端点白名单由已注�?`redirectUris` 自动推导（提�?origin）。子项目 origin 需与任一 `redirectUri` �?origin 匹配。新�?Client 后最�?10 秒生效�?

---

## 账户状态变�?Webhook

管理员在 SSO 中心封禁/解冻/删除用户时，会向运维配置�?Webhook URL 列表（`SSO_STATUS_CHANGE_WEBHOOK_URLS`，逗号分隔）推�?`account_status_change` 事件�?

```json
{
  "event": "account_status_change",
  "sub": "<userId>",
  "old_status": "active",
  "new_status": "banned",
  "source": "admin",
  "timestamp": "2026-08-17T08:00:00.000Z"
}
```

`new_status` 取值：`active`（解冻）、`banned`（冻�?封禁）、`deleted`（删除）�?

### 签名验证

每个请求携带签名头（配置�?`SSO_WEBHOOK_SECRET` 时）�?

```
X-Webhook-Signature: t=<unix秒时间戳>,v1=<HMAC-SHA256 hex>
```

签名串为 `<t>.<原始请求�?`（注意是 body 原文，不要先反序列化再重�?stringify），密钥为运维侧配置�?`SSO_WEBHOOK_SECRET`�?

验证步骤�?

1. 读取原始请求体（raw body）与 `X-Webhook-Signature` 头；
2. 解析头中�?`t` �?`v1`；`t` 与当前时间相差超�?5 分钟应拒绝（防重放）�?
3. 用共享密钥对 `${t}.${rawBody}` 计算 HMAC-SHA256（hex），�?`v1` 做常量时间比较�?

Node.js 示例�?

```js
const crypto = require("crypto");

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  const params = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.split("=", 2))
  );
  const t = Number(params.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const actual = params.v1 || "";
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  );
}
```

---

## 用户资料变更 Webhook（profile_update�?

用户�?SSO 中心修改昵称/头像/生日后，主站会向**该用户已授权且配置了 `webhookUri`** 的每�?Client 推�?`profile_update` 事件，子项目可据此失效本地用户缓存，不必轮询 userinfo�?

- **配置**：管理员�?`/admin/oauth-clients` 创建/编辑 Client 时填�?`webhookUri`（要�?HTTPS 公网地址，与 redirect_uri 同源�?SSRF 校验）�?
- **投递方�?*：`POST {webhookUri}`，`Content-Type: application/json`，body �?`{ "event_token": "<jwt>" }`�?
- **触发条件**：仅当资料发生实际变更时触发；fire-and-forget，不阻塞主站响应�?
- **重试**：同步失败重�?1 次后落入补偿队列，由 cron �?15 分钟指数退避重投，超过 10 次丢弃。重投携带落库时的资料快照，**子项目应�?userinfo 拉取的最新数据为�?*�?

### event_token 验签

`event_token` �?RS256 签名�?JWT（与 backchannel logout token 同一套密钥，可用 `/api/oauth/jwks` 公钥验签），payload�?

```json
{
  "type": "profile_event",
  "sub": "<userId>",
  "aud": "<clientId>",
  "jti": "...",
  "iat": 1724000000,
  "exp": 1724000300,
  "events": { "https://nihplod.cn/event/profile_update": {} },
  "profile": { "nickname": "...", "avatar": "...", "birthday": "..." }
}
```

验签要点：校验签名、`type === "profile_event"`、`aud` 等于�?Client �?clientId、`exp` 未过期；`events` 中须�?`https://nihplod.cn/event/profile_update`；`jti` 建议做短期防重放去重。`profile` 仅含昵称/头像/生日�?*不含手机�?*�?

---

## 积分/等级同步（商城对接）

官网是积�?等级权威账本。商城侧的积分变动通过签名内部 API 上报入账，并可随时拉取官网权威余额对齐。鉴权方式与其他 `/api/v1/internal/*` 端点一致（`INTERNAL_API_KEYS` �?`project=mall` �?key/secret，HMAC-SHA256 签名 = `"METHOD|path|timestamp|nonce|bodyHash"`）�?

### 上报积分变动

`POST /api/v1/internal/points/sync`

```json
{
  "phone": "13800138000",
  "delta": 15,
  "spentDelta": 150,
  "reference": "mall-order-N20260823001",
  "note": "商城订单消费奖励"
}
```

- `phone`：中国手机号（`^1[3-9]\d{9}$`，与官网注册手机号一致），联邦账号按手机号关联�?
- `delta`：积分变动，非零整数，正加负减（如积分抵扣传负值）�?
- `spentDelta`：可选，消费额变动（元，整数，默�?0），用于官网侧会员等级重算�?
- `reference`：商城侧唯一单据号，幂等键。重复上报不重复入账，返�?`duplicated: true`�?
- `note`：可选，流水备注�?

成功响应（`totalPoints`/`totalSpent`/`membershipLevel` 为入账后的官网权威值，商城应以此对齐本地展示）�?

```json
{
  "success": true,
  "data": { "totalPoints": 320, "totalSpent": 5200, "membershipLevel": "ADVANCED" }
}
```

### 拉取权威余额

`POST /api/v1/internal/user/balance`

```json
{ "phone": "13800138000" }
```

响应�?

```json
{
  "success": true,
  "data": { "totalPoints": 320, "totalSpent": 5200, "membershipLevel": "ADVANCED" }
}
```

### 错误�?

| HTTP | code | 说明 |
| --- | --- | --- |
| 401 | `MISSING_AUTH` / `INVALID_TIMESTAMP` / `REPLAY_ATTACK` / `UNAUTHORIZED` | 鉴权失败（缺�?/ 时间戳超 ±5 分钟 / nonce 重放 / 签名错误�?|
| 400 | `INVALID_JSON` / `INVALID_PARAMS` | 请求体或参数校验失败 |
| 404 | `USER_NOT_FOUND` | 手机号在官网不存在（用户尚未在官网注�?绑定�?|
| 429 | `RATE_LIMITED` | 触发 IP 限流 |
| 500 | `INTERNAL_ERROR` | 服务器内部错误（可重试，`reference` 幂等保证重试安全�?|

---

## 小程序「关联官网账户」发�?

小程序内「关联官网账户」入口的短信验证码通过官网公开端点 `POST /api/auth/send-code` 发送，`type` 使用专用�?`bind`�?

```json
{ "phone": "13800138000", "type": "bind" }
```

- **用�?*：仅为「小程序微信身份 �?官网手机号账户」绑定流程发码；验证码核销�?`POST /api/auth/wechat/bind`（短信通道，body 携带 `bindToken + phone + code`）完成�?
- **CSRF 豁免**：小程序�?Cookie，无法完成双提交校验，故 `type=bind` 豁免 CSRF（其�?`type` 仍强制校验）。安全性由短信验证码本�?+ 限流保证，与 `/api/auth/wechat/bind` �?`bindToken` 通道的豁免逻辑同理�?
- **防枚举假发�?*：仅当手机号**已存在官网账�?*时才真实发码；未注册手机号返回与真实发送完全相同的成功响应（`{ success: true, data: { expiresIn: 300 } }`）但不发码、不入库，且响应耗时与真实短信通道同量级，避免通过响应体或时序枚举官网注册用户�?
- **限流不变**�?0 秒发送间隔、每小时最�?5 次、IP 级限流对 `type=bind` 照常生效；频控按 `phone + type` 维度独立计数，不影响 login/register/reset 通道�?
- **验证码语�?*：`SmsCode.type = "bind"`，有效期 5 分钟；绑定校验同时兼�?`register` �?`bind` 两种类型（取最新未使用记录），官网扫码绑定页原�?`register` 通道行为不变�?

---

## 常见问题

### Q: 回调页面�?"State 参数不匹�? 错误�?

A: state 存储�?**sessionStorage** 中（按标签页隔离）。请确保�?

1. 授权跳转与回调在**同一个标签页**完成——在新标签页打开回调 URL 会读不到 state�?
2. 回调页面使用与发起登录相同的 `clientId`（state �?clientId 隔离存储）；
3. 浏览器未禁用 sessionStorage（如部分隐私模式）�?

### Q: 如何在后端验�?token�?

A: 推荐两种方式�?

1. **Introspection 端点（推荐，适用所有子项目�?*�?

```bash
curl -X POST https://nihplod.cn/api/oauth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET&token=ACCESS_TOKEN"
```

> ℹ️ **Public Client 的免�?introspect**：Public Client（SPA/移动端，�?client_secret）可仅凭 `client_id` 调用 introspect，这�?RFC 7662 的常见取舍。服务端强制 audience 校验—�?*只能查询签发给该 client 自己�?token**，查询其�?client �?token 一律返�?`active: false`（与"token 无效"不可区分），不会泄露其它子项目的会话信息。安全注意事项：
>
> - introspect 响应仅表�?token 状态，**不要�?`active: true` 当作用户身份凭证**；鉴权仍应基于有�?access token（userinfo / 本地 JWKS 验签）；
> - 浏览器端直接调用 introspect 会把 access token 暴露给前端代码，敏感后端服务建议�?Confidential Client 在服务端调用�?
> - 免密路径与付费路径一样受 IP �?client 级限流约束，请勿将其用作高频探活接口�?

2. **本地 JWT 验证（仅内部 Confidential Client，需共享 RS256 公钥�?*�?

```typescript
import { createTokenVerifier } from "@nihplod/sso-verify";

// 方式 A：通过 JWKS 自动拉取公钥（推荐，支持密钥轮换�?
const verifier = createTokenVerifier({
  jwksUri: "https://nihplod.cn/api/oauth/jwks",
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

// 方式 B：直接配置公�?
const verifier = createTokenVerifier({
  accessTokenPublicKey: process.env.SSO_ACCESS_TOKEN_PUBLIC_KEY,
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

const payload = await verifier.verify(token);
```

> ⚠️ **不要�?`JWT_ACCESS_SECRET`（HS256 对称密钥）分发给外部子项目�?* 外部子项目请优先使用 Introspection；本�?JWT 验证仅适用于已与主站安全共�?RS256 公钥的内部服务�?

> ⚠️ **本地 JWKS 验签无法实时感知撤销�?* 用户撤销授权或管理员终止会话后，access token 在主站侧会立即失效（�?token �?`sid` claim 校验会话状态），但本地验签只做离线签名校验，被撤销�?token 在其 TTL（默�?15 分钟）内仍会通过。需要即时获知撤销的子项目（如涉及敏感操作）应改用 Introspection 端点验证�?

### Q: Public Client（SPA）调�?logout(true) 后，SSO 中心会话是否立即失效�?

A: Public Client 调用 `sso.logout(true)` 会重定向�?SSO 中心�?end_session_endpoint（Discovery 获取，默�?`/api/oauth/end-session`）；用户确认后，SSO 中心会撤销其所有会话并触发 backchannel logout。`@nihplod/sso-sdk` 在调�?`logout()`（不带参数）时，也会尝试携带 `client_id` 调用 `/api/oauth/revoke` 撤销当前 refresh_token（RFC 7009 允许 Public Client 仅使�?client_id 撤销）�?

### Q: Next.js middleware 是否支持 PKCE�?

A: 支持。`@nihplod/sso-sdk/next` �?`createSsoMiddleware` �?Edge Runtime 中使�?`crypto.subtle.digest("SHA-256")`
计算 code_challenge，并�?code_verifier 存入 httpOnly cookie �?callback handler 使用�?

### Q: 如何切换 Token 存储方式�?

token **默认存储�?sessionStorage**（标签页级持久化：刷�?整页跳转后登录态保留，关闭标签页清除）。如需�?Tab 共享 / 关闭浏览器后保持登录�?
可显式注�?localStorage 适配器：

```typescript
import { setTokenStorage, createSecureStorage } from "@nihplod/sso-sdk";

// persist: true �?使用 localStorage（多 Tab 同步，但 refresh_token 明文落盘，XSS 可窃取）
setTokenStorage(createSecureStorage({ persist: true }));

// persist: false（默认）�?sessionStorage（标签页级，隐私模式下降级为内存�?
setTokenStorage(createSecureStorage({ persist: false }));
```

⚠️ `persist: true` 仅建议在 BFF/Confidential Client 或明确接�?XSS 风险的场景使用�?
也可以传入任意实�?`TokenStorage` 接口（`get / set / remove`）的自定义存储�?

### Q: 在哪里查看接入状态和统计数据�?

A: 管理后台 �?[SSO 客户端管理](/admin/oauth-clients) 页面。每�?Client 会显示活跃用户数和最近活跃时间�?
