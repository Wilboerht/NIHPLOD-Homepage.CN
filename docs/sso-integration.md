# SSO 子项目接入指南

NIHPLOD 统一认证中心 OAuth 2.0 接入文档。5 分钟快速接入，安全省心。

## 前置条件

1. 在 [管理后台](/admin/oauth-clients) 注册 OAuth Client
2. 记录 `clientId`；浏览器端 SPA（Public Client）**不需要** `clientSecret`，BFF / Next.js 等 Confidential Client 需要
3. 配置至少一个 `redirect_uri`（回调 URL）

## 快速开始

### 1. 安装 SDK

```bash
npm install @nihplod/sso-sdk
```

### 2. 初始化

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

const sso = new SsoClient({
  clientId: "your-client-id",           // 从管理后台获取
  redirectUri: "https://yourapp.com/callback",
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile phone",       // 按需请求
});
```

### 3. 发起登录

```typescript
// 跳转到 SSO 登录页
await sso.login();
// 或指定登录后返回地址
await sso.login("/dashboard");
```

### 4. 处理回调

在回调页面 URL（如 `/callback`）中：

```typescript
// 解析回调 URL 并交换 token
const tokenData = await sso.handleCallback(window.location.href);

// 获取用户信息
const user = await sso.getUserInfo();
console.log(user.nickname); // "张三"
```

### 5. 检查登录状态

```typescript
if (sso.isAuthenticated()) {
  // 已登录
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

管理后台创建 Client 时必须选择应用类型，这决定了 token 端点的认证方式。

### Confidential Client（默认）

适用场景：Next.js App Router、BFF、服务端应用、桌面端原生应用等**拥有可信后端**的项目。

- 创建时勾选 **Confidential Client**
- 必须安全保存 `clientSecret`，仅在后端使用
- Token 端点需要携带 `client_id` + `client_secret`
- 后端推荐通过 Introspection 端点或 RS256 + JWKS 验证 access_token

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

// 仅在服务端构建 SsoClient 时使用 clientSecret
const sso = new SsoClient({
  clientId: "your-client-id",
  clientSecret: process.env.SSO_CLIENT_SECRET, // 不可泄露到前端
  redirectUri: "https://yourapp.com/api/auth/callback",
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile",
});
```

### Public Client

适用场景：React SPA、Vue SPA、移动端 H5、桌面端 Electron 等**无可信后端**的项目。

- 创建时勾选 **Public Client**
- **不需要也不应该传入 clientSecret**；前端代码中暴露 clientSecret 属于安全事故
- 依赖 PKCE S256 保护授权码流程
- token 端点只传 `client_id`，不传 `client_secret`

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

// 浏览器端 SPA：不传 clientSecret
const sso = new SsoClient({
  clientId: "your-client-id",
  redirectUri: "https://yourapp.com/callback",
  ssoBaseUrl: "https://nihplod.cn",
  scopes: "openid profile",
});
```

### 类型选错怎么办？

可在 [管理后台](/admin/oauth-clients) 编辑 Client 切换类型。切换后：

- Confidential → Public：停止使用 clientSecret，前端/后端配置同步移除 secret
- Public → Confidential：需要立即轮换密钥并安全保存新生成的 clientSecret，旧 Public 配置不再能刷新 token

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
        // 浏览器端 SPA 为 Public Client，无需 clientSecret
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

  if (isLoading) return <div>加载中...</div>;

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

// 方式一：组件包裹
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
  // Confidential Client（BFF/Next.js）建议传入 clientSecret
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "https://yourapp.com/api/auth/callback",
  publicPaths: ["/", "/public", "/api/auth/logout"], // 不需要登录的路径
  // ⚠️ 校验强度说明：
  // - validateSsoCookie 默认为 true：对主站 SSO 会话 Cookie（__Host-user_token）会调用
  //   Introspection 端点二次验证（每请求一次网络调用，有 30s 进程内缓存）。
  // - 显式设置 validateSsoCookie: false 可降为仅检查 Cookie 存在性（低延迟），
  //   但这只能防"未登录访问"，不能防伪造/已撤销的 Cookie。
  // - 对子项目自身的 access_token Cookie（回调 handler 写入的）始终会做 Introspection 校验。
  // validateSsoCookie: false,
  // 本地 HTTP 开发（http://localhost）需开启 insecureLocalDev（middleware/callback/logout
  // 三处同时设置），否则浏览器拒绝写入 Secure Cookie，middleware 会永远判定未登录而
  // 反复跳转 SSO（详见下方说明）。生产严禁启用。
  // insecureLocalDev: true,
});

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)", "/api/auth/:path*"],
};
```

> **Token 过期后的预期行为**：Middleware **不会刷新 token**。当 access_token Cookie 过期
> 或 Introspection 判定失效时，Middleware 会清除该 Cookie 并重定向到 `/api/oauth/authorize`；
> 由于用户在主站仍持有 SSO 会话，authorize 端点会立即携带新授权码 302 回来（silent re-auth），
> 回调 handler 重新写入 Cookie —— 用户通常只感知到一次快速跳转，无需任何额外处理。

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

export const GET = logoutHandler;  // 兼容 OIDC RP-Initiated Logout（GET）
export const POST = logoutHandler; // UI 层推荐用 POST 触发，避免 GET 被跨站请求滥用（CSRF）
```

> ⚠️ 本地开发使用 `http://localhost` 时，浏览器会拒绝 `Secure` Cookie——且 `__Host-`/`__Secure-` 前缀的 Cookie 缺少 `Secure` 属性时会被直接拒写（Chrome/Edge/Firefox 均强制；部分浏览器把 localhost 视为 secure context 而接受普通 `Secure` Cookie，但任何浏览器都不会接受无前缀要求却缺 Secure 的前缀 Cookie）。**后果**：登录回调看似成功，但 Cookie 根本写不进去，Middleware 永远判定未登录，于是反复跳转 SSO 授权页形成无限重定向。
>
> 解决办法（二选一）：
> 1. 在 `createSsoMiddleware` / `createCallbackRouteHandler` / `createLogoutRouteHandler` 三处同时设置 `insecureLocalDev: true`（关闭 Secure 并去除前缀，启动时打印告警；**生产必须移除**）；
> 2. 或手动绕过：在 `.env.local` 使用 HTTPS 地址（如 `next dev --experimental-https`），或自行覆写 `accessTokenCookieName` 等配置为无前缀名称并自行处理 Secure 属性。

---

## OAuth 流程详解

```
 子项目 (SPA/Next.js)                    NIHPLOD SSO 中心
 ─────────────────                        ───────────────
 1. sso.login()
    生成 PKCE verifier + state
    302 → /api/oauth/authorize ──────→ 2. 检查用户登录状态
                                         3. 未登录 → 302 到 /login
                                         4. 用户登录
                                         5. 展示 consent 页
                                         6. 用户确认授权
    8. 302 → redirect_uri?code=xxx  ←── 7. 302 返回 auth code
    9. sso.handleCallback()
       校验 state
       用 code + verifier 换 token
       POST /api/oauth/token ─────────→ 10. 验证 code + PKCE
         ←── access_token +            11. 签发 token
             refresh_token + id_token
```

---

## 安全最佳实践

### PKCE（强制启用）

SDK 与服务端均强制使用 PKCE S256。浏览器端 SPA（Public Client）不传 client_secret，
完全依赖 PKCE 防止授权码被截获。code_verifier 使用 `crypto.getRandomValues` 生成，
code_challenge 通过 SHA-256 哈希计算。回调时 SDK 自动完成 verifier 校验。

### State 参数（CSRF 防护）

每次登录请求自动生成 32 字节随机 state，回调时严格比对。开发者无需手动处理。

⚠️ 服务端对 state 有强制长度约束：**32–512 字符**（比 RFC 6749 更严格）。SDK 生成的 state 天然满足；若你自行实现授权请求而未使用 SDK，必须发送足够长度的 state，否则 `/api/oauth/authorize` 会回传 `invalid_request`。

### Token 存储策略

- **token 默认存储在 sessionStorage**（标签页级持久化）：登录回调的整页跳转和页面刷新后登录态保留，关闭标签页即自动清除，且不跨 Tab 共享，缩小了 XSS 窃取 refresh_token 的暴露面；SSR/隐私模式写入失败时降级为内存（此时刷新后需重新授权）
- **PKCE verifier / state / return_url 等临时数据存储在 sessionStorage**（按标签页隔离），因此授权跳转与回调必须在同一标签页完成
- 需要多 Tab 间同步 token 时，必须**显式**注入 localStorage 适配器（见下方"如何切换 Token 存储方式"）；⚠️ persist 到 localStorage 会让 refresh_token 明文落盘且长期保留，仅建议在 BFF/Confidential Client 场景使用
- Next.js（Middleware + Route Handler）方式将 token 存入 httpOnly Secure cookie，浏览器 JS 无法读取

### redirect_uri 规范

- 必须与注册时完全一致（精确匹配），包括协议、域名、端口、路径
- 仅允许 HTTPS（生产环境）
- 建议使用 `/api/auth/callback` 等专用路径

### Scope 最小权限

- `openid` — 仅返回用户 ID
- `profile` — 昵称、头像
- `phone` — 手机号（脱敏）
- `membership` — 会员等级、积分

示例：商城项目 `"openid profile phone"`，论坛项目 `"openid profile"`

> ⚠️ 手机号 claim 名为**非标准的 `phone`**（非 OIDC 标准的 `phone_number`），id_token 与 userinfo 均如此。且手机号始终**脱敏**返回（如 `138****8000`），无法通过 SSO 获取明文手机号。

### Token 刷新

- access_token 有效期 15 分钟
- SDK 自动在过期前 60 秒静默刷新
- 刷新使用互斥锁防止并发
- refresh_token 采用原子轮换（旧 token 立即作废）
- **Refresh Token 所有权校验**：OAuth 场景下 refresh token 会携带 `client_id` 与 `scope` 声明，
  `/api/oauth/token` 在 refresh 流程中严格校验 token 归属的 client 与请求方一致，
  防止子项目 A 的 refresh token 被拿到子项目 B 使用

### ID Token 验证

SDK 在 `handleCallback` 与 Next.js 回调 handler 中会自动验证 ID Token（`iss / aud / exp / sub`、签名、`at_hash`）：

- ID Token **必须使用 RS256 签名**。SDK 通过 `/api/oauth/jwks` 拉取公钥完成签名验证。
- **SDK 一律拒绝 HS256 签名的 ID Token**（对称密钥无法安全分发给 Public Client / BFF，
  拒绝时抛出 `id_token_hs256_unsupported` 错误）。因此主站**必须**配置 RS256 密钥对，
  否则所有子项目回调都会失败。

主站生成 RS256 密钥：

```bash
npx tsx scripts/generate-oauth-rs256-keys.ts
```

脚本会直接输出 `\n` 转义的单行 `.env` 格式，将 `JWT_ID_TOKEN_PRIVATE_KEY` / `JWT_ID_TOKEN_PUBLIC_KEY`
（以及同时生成的 access_token / logout_token 密钥对）写入 `.env.local` 后重启应用即可生效。

### 授权错误回传

当 `/api/oauth/authorize` 已经识别出合法的 `client_id` + `redirect_uri`，
但其他参数（scope、PKCE、state、response_type 等）校验失败时，
SSO 中心不会直接返回 JSON 400，而是按 OAuth 2.0 规范 302 重定向到 `redirect_uri?error=...&error_description=...&state=...`。
子项目回调处理必须同时检查 `code` 和 `error` 参数。

### 登录页取消（返回）行为

用户在 SSO 登录页点击"返回"按钮时，SSO 中心会取消本次授权（而非回主站首页或死循环重定向）：
`GET /api/oauth/cancel` 校验 `client_id` / `redirect_uri` 归属后，302 回传
`redirect_uri?error=access_denied&error_description=用户取消了登录&state=...&iss=...`（弹窗登录额外透传 `popup_nonce`）。
子项目 `handleCallback` 会解析 `error` 参数并抛错，回调页可展示"已取消登录"。
因此子项目无需为登录页返回按钮做特殊处理，但应保证回调页对 `error` 分支有友好提示。

### 弹窗登录（Popup）

SPA 场景可使用 `sso.loginPopup()` 在小窗口中完成登录，主页面不丢失状态（适合表单填写中途登录等场景）：

```typescript
try {
  const tokenData = await sso.loginPopup({ returnUrl: "/dashboard" });
} catch (err) {
  if (err instanceof SsoError && err.code === "popup_blocked") {
    await sso.login("/dashboard"); // 弹窗被拦截，回退到整页跳转
  }
}
```

约束：

- 回调路由必须渲染 `<CallbackPage />`（`@nihplod/sso-sdk/react`）：它检测 `window.opener` 并通过 postMessage 把回调 URL 回传主窗口，由主窗口完成 token 交换；
- 回调页与主页面必须同 origin（postMessage 会校验来源 origin 与一次性 `popup_nonce`，伪造消息会被丢弃）；
- 移动浏览器 / 严格弹窗策略下建议始终准备 `popup_blocked` 回退路径。

### 嵌入（iframe）限制

SSO 中心的登录、授权确认等页面带有 CSP `frame-ancestors 'self'`，**禁止被跨站 iframe 嵌入**（防点击劫持）。
不要用 iframe 嵌入 SSO 登录页实现"页内登录"——浏览器会直接拒绝渲染。
需要不打断当前页面上下文的场景请使用上述 popup 方式。

---

## Cookie 策略

### Session 共享

SSO 中心使用 `__Host-user_token` Cookie 维持用户登录状态：

| 属性 | 值 | 说明 |
|------|-----|------|
| `HttpOnly` | `true` | JS 不可读取 |
| `Secure` | `true` | 仅 HTTPS |
| `SameSite` | `Lax` | 顶级导航自动携带 |
| `Path` | `/` | 全站可用 |
| `__Host-` 前缀 | 是 | 强制 Secure + Path=/ |

子域名间（如 `advisor.nihplod.cn`→`nihplod.cn`）的顶级导航会携带 Cookie，用户无需重复登录。

## 跨域（CORS）

Token/UserInfo/Introspect 端点白名单由已注册 `redirectUris` 自动推导（提取 origin）。子项目 origin 需与任一 `redirectUri` 的 origin 匹配。新增 Client 后最多 10 秒生效。

---

## 常见问题

### Q: 回调页面报 "State 参数不匹配" 错误？

A: state 存储在 **sessionStorage** 中（按标签页隔离）。请确保：

1. 授权跳转与回调在**同一个标签页**完成——在新标签页打开回调 URL 会读不到 state；
2. 回调页面使用与发起登录相同的 `clientId`（state 按 clientId 隔离存储）；
3. 浏览器未禁用 sessionStorage（如部分隐私模式）。

### Q: 如何在后端验证 token？

A: 推荐两种方式：

1. **Introspection 端点（推荐，适用所有子项目）**：

```bash
curl -X POST https://nihplod.cn/api/oauth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET&token=ACCESS_TOKEN"
```

2. **本地 JWT 验证（仅内部 Confidential Client，需共享 RS256 公钥）**：

```typescript
import { createTokenVerifier } from "@nihplod/sso-verify";

// 方式 A：通过 JWKS 自动拉取公钥（推荐，支持密钥轮换）
const verifier = createTokenVerifier({
  jwksUri: "https://nihplod.cn/api/oauth/jwks",
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

// 方式 B：直接配置公钥
const verifier = createTokenVerifier({
  accessTokenPublicKey: process.env.SSO_ACCESS_TOKEN_PUBLIC_KEY,
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

const payload = await verifier.verify(token);
```

> ⚠️ **不要将 `JWT_ACCESS_SECRET`（HS256 对称密钥）分发给外部子项目。** 外部子项目请优先使用 Introspection；本地 JWT 验证仅适用于已与主站安全共享 RS256 公钥的内部服务。

> ⚠️ **本地 JWKS 验签无法实时感知撤销。** 用户撤销授权或管理员终止会话后，access token 在主站侧会立即失效（按 token 的 `sid` claim 校验会话状态），但本地验签只做离线签名校验，被撤销的 token 在其 TTL（默认 15 分钟）内仍会通过。需要即时获知撤销的子项目（如涉及敏感操作）应改用 Introspection 端点验证。

### Q: Public Client（SPA）调用 logout(true) 后，SSO 中心会话是否立即失效？

A: Public Client 调用 `sso.logout(true)` 会重定向到 SSO 中心的 end_session_endpoint（Discovery 获取，默认 `/api/oauth/end-session`）；用户确认后，SSO 中心会撤销其所有会话并触发 backchannel logout。`@nihplod/sso-sdk` 在调用 `logout()`（不带参数）时，也会尝试携带 `client_id` 调用 `/api/oauth/revoke` 撤销当前 refresh_token（RFC 7009 允许 Public Client 仅使用 client_id 撤销）。

### Q: Next.js middleware 是否支持 PKCE？

A: 支持。`@nihplod/sso-sdk/next` 的 `createSsoMiddleware` 在 Edge Runtime 中使用 `crypto.subtle.digest("SHA-256")`
计算 code_challenge，并将 code_verifier 存入 httpOnly cookie 供 callback handler 使用。

### Q: 如何切换 Token 存储方式？

token **默认存储在 sessionStorage**（标签页级持久化：刷新/整页跳转后登录态保留，关闭标签页清除）。如需多 Tab 共享 / 关闭浏览器后保持登录，
可显式注入 localStorage 适配器：

```typescript
import { setTokenStorage, createSecureStorage } from "@nihplod/sso-sdk";

// persist: true → 使用 localStorage（多 Tab 同步，但 refresh_token 明文落盘，XSS 可窃取）
setTokenStorage(createSecureStorage({ persist: true }));

// persist: false（默认）→ sessionStorage（标签页级，隐私模式下降级为内存）
setTokenStorage(createSecureStorage({ persist: false }));
```

⚠️ `persist: true` 仅建议在 BFF/Confidential Client 或明确接受 XSS 风险的场景使用。
也可以传入任意实现 `TokenStorage` 接口（`get / set / remove`）的自定义存储。

### Q: 在哪里查看接入状态和统计数据？

A: 管理后台 → [SSO 客户端管理](/admin/oauth-clients) 页面。每个 Client 会显示活跃用户数和最近活跃时间。
