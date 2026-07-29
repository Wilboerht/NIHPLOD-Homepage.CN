# @nihplod/sso-sdk

NIHPLOD SSO 子项目接入 SDK — OAuth 2.0 授权码 + PKCE 客户端封装。

## 安装

```bash
npm install @nihplod/sso-sdk
```

## 快速开始

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

const sso = new SsoClient({
  clientId: "your-client-id",
  redirectUri: "https://yourapp.com/callback",
  ssoBaseUrl: "https://nihplod.cn",
});

// 1. 发起登录
await sso.login();

// 2. 处理回调（在回调页面中）
const token = await sso.handleCallback(window.location.href);

// 3. 获取用户信息
const user = await sso.getUserInfo();

// 4. 登出
await sso.logout();
```

---

## API 参考

### `new SsoClient(config)`

创建 SSO 客户端实例。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `clientId` | `string` | ✅ | OAuth Client ID |
| `redirectUri` | `string` | ✅ | 回调 URL，须与注册时一致 |
| `ssoBaseUrl` | `string` | ✅ | SSO 中心地址，如 `https://nihplod.cn` |
| `scopes` | `string` | ❌ | 空格分隔的 scope，默认 `"openid profile"` |
| `clientSecret` | `string` | ❌ | **仅 Confidential Client 需要**。浏览器端 SPA（Public Client）请勿传入，避免密钥泄露。BFF / Next.js Route Handler 可传入 |

### `sso.login(returnUrl?)`

发起 SSO 登录。生成 PKCE 参数后 302 跳转到 SSO 登录页。

| 参数 | 类型 | 说明 |
|------|------|------|
| `returnUrl` | `string` | 登录成功后的返回地址（可选） |

### `sso.getLoginUrl(returnUrl?)`

构建登录 URL 字符串，不执行跳转。返回 `Promise<string>`。

### `sso.handleCallback(callbackUrl)`

处理 OAuth 回调。解析 URL 中的 `code` 和 `state`，校验 state 后用 code 换取 token。

| 参数 | 类型 | 说明 |
|------|------|------|
| `callbackUrl` | `string` | 完整的回调 URL（`window.location.href`） |

返回 `Promise<TokenData>`。

### `sso.refreshToken()`

使用 refresh_token 刷新 access_token。采用互斥锁防止并发刷新。

返回 `Promise<TokenData>`。

### `sso.getUserInfo()`

获取当前用户信息。若 access_token 已过期则自动刷新。

返回 `Promise<SsoUser>`。

```typescript
interface SsoUser {
  sub: string;
  nickname?: string;
  avatar?: string;
  phone?: string;          // 脱敏手机号
  membership_level?: string;
  total_points?: number;
}
```

### `sso.getAccessToken()`

获取当前有效的 access_token。若已过期则自动刷新。

返回 `Promise<string | null>`。

### `sso.isAuthenticated()`

检查是否已认证（仅本地检查，不发起网络请求）。

返回 `boolean`。

### `sso.logout(redirectToSso?)`

清除本地 token 数据，并尝试撤销服务端 refresh_token。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `redirectToSso` | `boolean` | `false` | 是否重定向到 SSO 登出页（OIDC RP-Initiated Logout） |

当 `redirectToSso=true` 时，会跳转到 `/logout?client_id=...&post_logout_redirect_uri=...`，
由主站完成会话清除后回到子项目回调地址。

### `sso.getDiscovery()`

获取 OIDC Discovery 文档。

返回 `Promise<OidcDiscovery>`。

---

## TypeScript 类型

```typescript
// SsoClient 配置
interface SsoClientConfig {
  clientId: string;
  redirectUri: string;
  ssoBaseUrl: string;
  scopes?: string;
  clientSecret?: string; // 仅 Confidential Client 需要
}

// Token 数据
interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token?: string;
  issued_at: number;
  expires_at: number;
}

// 用户信息
interface SsoUser {
  sub: string;
  nickname?: string;
  avatar?: string;
  phone?: string;
  membership_level?: string;
  total_points?: number;
}

// OIDC Discovery
interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  introspection_endpoint: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
}
```

---

## React 绑定

### `<SsoProvider>`

```tsx
import { SsoProvider } from "@nihplod/sso-sdk/react";

<SsoProvider
  config={{
    clientId: "...",
    redirectUri: "...",
    ssoBaseUrl: "...",
    scopes: "openid profile",
  }}
  refreshThreshold={60}  // 过期前 60s 自动刷新
>
  <App />
</SsoProvider>
```

### `useSso()`

```tsx
import { useSso } from "@nihplod/sso-sdk/react";

const {
  user,              // SsoUser | null
  isAuthenticated,   // boolean
  isLoading,         // boolean
  login,             // (returnUrl?: string) => Promise<void>
  logout,            // (redirectToSso?: boolean) => Promise<void>
  refreshUser,       // () => Promise<void>
  getAccessToken,    // () => Promise<string | null>
  client,            // SsoClient 实例
} = useSso();
```

### `<RequireAuth>`

```tsx
import { RequireAuth } from "@nihplod/sso-sdk/react";

<RequireAuth>
  <ProtectedContent />
</RequireAuth>
```

### `withAuth(Component)`

```tsx
import { withAuth } from "@nihplod/sso-sdk/react";

function DashboardPage() { return <div>Dashboard</div>; }
export default withAuth(DashboardPage);
```

### `<CallbackPage>`

```tsx
import { CallbackPage } from "@nihplod/sso-sdk/react";

// 在回调路由中渲染此组件即可
export default function AuthCallback() {
  return <CallbackPage />;
}
```

---

## Next.js 绑定

Next.js 推荐采用 **Middleware + Route Handler** 的 BFF 模式，token 存放在
`httpOnly` Cookie 中，JavaScript 无法读取，安全性最高。

```typescript
// src/middleware.ts
import { createSsoMiddleware } from "@nihplod/sso-sdk/next";

export const middleware = createSsoMiddleware({
  clientId: "...",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
  scopes: "openid profile",
  publicPaths: ["/", "/public"],
  // Confidential Client（BFF）可传入 clientSecret
  // clientSecret: process.env.SSO_CLIENT_SECRET,
});

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
```

```typescript
// src/app/api/auth/callback/route.ts
import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";

export const GET = createCallbackRouteHandler({
  clientId: "...",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
  defaultReturnPath: "/dashboard",
  // 与 middleware 一致，Confidential Client 可传入 clientSecret
});
```

```typescript
// src/app/api/auth/logout/route.ts
import { createLogoutRouteHandler } from "@nihplod/sso-sdk/next";

export const GET = createLogoutRouteHandler({
  clientId: "...",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
  postLogoutRedirectUri: "https://yourapp.com/",
  redirectToSso: true,
});
```

页面中使用标准 `<a>` 跳转登出端点即可：

```tsx
<a href="/api/auth/logout">退出登录</a>
```

### Cookie 配置

默认 Cookie 名称：

| Cookie | 默认名称 | 说明 |
|--------|----------|------|
| access_token | `__Host-nihplod_sso_at` | 要求 Secure + Path=/ + 无 Domain |
| refresh_token | `__Host-nihplod_sso_rt` | 要求 Secure + Path=/ + 无 Domain |
| state | `__Host-nihplod_sso_state` | 要求 Secure + Path=/ + 无 Domain |
| return_url | `__Host-nihplod_sso_return` | 要求 Secure + Path=/ + 无 Domain |
| verifier | `__Secure-nihplod_sso_verifier` | 要求 Secure + 无 Domain；Path 为回调路径，因此使用 `__Secure-` 前缀 |

> 本地开发若使用 `http://localhost`，浏览器会拒绝 `Secure` Cookie。此时可仅在本地关闭 `secure`，生产环境必须启用 HTTPS。

---

## 安全建议与 Token 存储

SDK 默认将 token 保存在**内存**中，Public Client（SPA/移动端/桌面端）在浏览器中不应把 `refresh_token` 写入 `localStorage`，以防止 XSS 窃取长期凭证。

如果子项目是 **Next.js BFF / Confidential Client**，可以将 token 保存在 `localStorage` 以便多 Tab 共享：

```typescript
import { setTokenStorage, createSecureStorage } from "@nihplod/sso-sdk";

setTokenStorage(createSecureStorage({ persist: true }));
```

生产环境更推荐通过 Service Worker 或 HTTP-only Cookie 封装 refresh token，前端只持有 access token 短期凭证。

---

## 工具函数

```typescript
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  setTokenStorage,
  createSecureStorage,
  getTokenData,
  saveTokenData,
  removeTokenData,
  clearAllSsoData,
} from "@nihplod/sso-sdk";

// PKCE
const verifier = generateCodeVerifier(64);
const challenge = await generateCodeChallenge(verifier);

// State
const state = generateState();

// 自定义 Token 存储（默认内存存储）
setTokenStorage(createSecureStorage({ persist: false }));
```
