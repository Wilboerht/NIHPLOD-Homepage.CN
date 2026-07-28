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
  // Confidential Client（BFF/Next.js）建议传入 clientSecret，
  // Middleware 会通过 Introspection 精确校验 access_token，防止伪造 Cookie 绕过
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "https://yourapp.com/api/auth/callback",
  publicPaths: ["/", "/public", "/api/auth/logout"], // 不需要登录的路径
});

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)", "/api/auth/:path*"],
};
```

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

export const GET = createLogoutRouteHandler({
  clientId: process.env.SSO_CLIENT_ID!,
  clientSecret: process.env.SSO_CLIENT_SECRET,
  ssoBaseUrl: process.env.SSO_BASE_URL || "https://nihplod.cn",
  redirectUri: process.env.SSO_REDIRECT_URI || "https://yourapp.com/api/auth/callback",
  postLogoutRedirectUri: process.env.SSO_POST_LOGOUT_REDIRECT_URI || "https://yourapp.com/",
  redirectToSso: true,
});
```

> 本地开发若使用 `http://localhost`，浏览器会拒绝 `Secure` Cookie。建议在 `.env.local` 中使用 HTTPS 地址，或仅在本地临时关闭 Secure（生产必须启用 HTTPS）。

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
    7. 302 → redirect_uri?code=xxx  ←── 7. 302 返回 auth code
    8. sso.handleCallback()
       校验 state
       用 code + verifier 换 token
       POST /api/oauth/token ─────────→ 9. 验证 code + PKCE
         ←── access_token +           10. 签发 token
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

### Token 存储策略

- React SDK 默认使用 `localStorage` 存储 token，以实现多 Tab 间自动同步并避免并发刷新
- 对 XSS 敏感的子项目可通过 `setTokenStorage()` 注入更安全的自定义实现（如内存存储、加密 storage）
- Next.js 回调 handler 将 token 存入 httpOnly Secure cookie

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

### Token 刷新

- access_token 有效期 15 分钟
- SDK 自动在过期前 60 秒静默刷新
- 刷新使用互斥锁防止并发
- refresh_token 采用原子轮换（旧 token 立即作废）
- **Refresh Token 所有权校验**：OAuth 场景下 refresh token 会携带 `client_id` 与 `scope` 声明，
  `/api/oauth/token` 在 refresh 流程中严格校验 token 归属的 client 与请求方一致，
  防止子项目 A 的 refresh token 被拿到子项目 B 使用

### ID Token 验证

SDK 在 `handleCallback` 中会自动验证 ID Token：
- 若主站配置了 `JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY`，ID Token 使用 RS256 签名，
  SDK 会通过 `/api/oauth/jwks` 拉取公钥完成签名验证（推荐）。
- 若主站未配置 RS256 密钥，ID Token 使用 HS256 签名；由于对称密钥无法安全分发给 Public Client，
  SDK 会跳过签名验证，但仍校验 `iss / aud / exp / sub` 等声明。

主站生成 RS256 密钥：

```bash
npx tsx scripts/generate-oauth-rs256-keys.ts
```

将输出的 `JWT_ID_TOKEN_PRIVATE_KEY` / `JWT_ID_TOKEN_PUBLIC_KEY` 写入 `.env.local` 后重启应用即可生效。

### 授权错误回传

当 `/api/oauth/authorize` 已经识别出合法的 `client_id` + `redirect_uri`，
但其他参数（scope、PKCE、state、response_type 等）校验失败时，
SSO 中心不会直接返回 JSON 400，而是按 OAuth 2.0 规范 302 重定向到 `redirect_uri?error=...&error_description=...&state=...`。
子项目回调处理必须同时检查 `code` 和 `error` 参数。

---

## 常见问题

### Q: 回调页面报 "State 参数不匹配" 错误？

A: 确保回调页面使用了同一个 `SsoClient` 实例（state 存储在 localStorage 中）。如果在不同标签页中登录，state 可能不匹配。

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

### Q: Public Client（SPA）调用 logout(true) 后，SSO 中心会话是否立即失效？

A: Public Client 调用 `sso.logout(true)` 会重定向到 SSO 中心 `/logout` 页面；用户确认后，SSO 中心会撤销其所有会话并触发 backchannel logout。`@nihplod/sso-sdk` 在调用 `logout()`（不带参数）时，也会尝试携带 `client_id` 调用 `/api/oauth/revoke` 撤销当前 refresh_token（RFC 7009 允许 Public Client 仅使用 client_id 撤销）。

### Q: Next.js middleware 是否支持 PKCE？

A: 支持。`@nihplod/sso-sdk/next` 的 `createSsoMiddleware` 在 Edge Runtime 中使用 `crypto.subtle.digest("SHA-256")`
计算 code_challenge，并将 code_verifier 存入 httpOnly cookie 供 callback handler 使用。

### Q: 如何切换 Token 存储方式？

```typescript
import { setTokenStorage } from "@nihplod/sso-sdk";

// 使用 localStorage（安全性较低）
setTokenStorage({
  get: (key) => localStorage.getItem(`sso_${key}`),
  set: (key, val) => localStorage.setItem(`sso_${key}`, val),
  remove: (key) => localStorage.removeItem(`sso_${key}`),
});
```

### Q: 在哪里查看接入状态和统计数据？

A: 管理后台 → [SSO 客户端管理](/admin/oauth-clients) 页面。每个 Client 会显示活跃用户数和最近活跃时间。
