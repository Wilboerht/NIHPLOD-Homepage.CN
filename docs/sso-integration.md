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
  clientId: "your-client-id",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
  publicPaths: ["/", "/public"], // 不需要登录的路径
});
```

### 回调 Route Handler

```typescript
// src/app/api/auth/callback/route.ts
import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";

export const GET = createCallbackRouteHandler({
  clientId: "your-client-id",
  // Confidential Client 可传入 clientSecret；Public Client 省略
  // clientSecret: "your-client-secret",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
});
```

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

- SDK 使用 `sessionStorage`（而非 `localStorage`）存储 token，页面关闭后自动清除
- 支持注入自定义存储实现（如 httpOnly cookie、React Native AsyncStorage）
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

### 授权错误回传

当 `/api/oauth/authorize` 已经识别出合法的 `client_id` + `redirect_uri`，
但其他参数（scope、PKCE、state、response_type 等）校验失败时，
SSO 中心不会直接返回 JSON 400，而是按 OAuth 2.0 规范 302 重定向到 `redirect_uri?error=...&error_description=...&state=...`。
子项目回调处理必须同时检查 `code` 和 `error` 参数。

---

## 常见问题

### Q: 回调页面报 "State 参数不匹配" 错误？

A: 确保回调页面使用了同一个 `SsoClient` 实例（state 存储在 sessionStorage 中）。如果在不同标签页中登录，state 可能不匹配。

### Q: 如何在后端验证 token？

A: 推荐两种方式：

1. **Introspection 端点（推荐，适用所有子项目）**：

```bash
curl -X POST https://nihplod.cn/api/oauth/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET&token=ACCESS_TOKEN"
```

2. **本地 JWT 验证（仅内部 Confidential Client，需共享 `JWT_ACCESS_SECRET`）**：

```typescript
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  accessTokenSecret: process.env.JWT_ACCESS_SECRET,
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

const payload = await verifier.verify(token);
```

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
