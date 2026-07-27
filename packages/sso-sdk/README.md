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

### `createSsoMiddleware(config)`

```typescript
// src/middleware.ts
import { createSsoMiddleware } from "@nihplod/sso-sdk/next";

export const middleware = createSsoMiddleware({
  clientId: "...",
  ssoBaseUrl: "...",
  redirectUri: "...",
  publicPaths: ["/", "/public"],
});
```

### `createCallbackRouteHandler(config)`

```typescript
// src/app/api/auth/callback/route.ts
import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";

export const GET = createCallbackRouteHandler({
  clientId: "...",
  ssoBaseUrl: "...",
  redirectUri: "...",
});
```

---

## 工具函数

```typescript
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  setTokenStorage,
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

// 自定义 Token 存储
setTokenStorage({
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
  remove: (k) => localStorage.removeItem(k),
});
```
