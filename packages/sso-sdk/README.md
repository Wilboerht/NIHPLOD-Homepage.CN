# @nihplod/sso-sdk

NIHPLOD SSO client SDK — OAuth 2.0 Authorization Code + PKCE wrapper for sub-projects.

## Install

```bash
npm install @nihplod/sso-sdk
```

## Quick Start

```typescript
import { SsoClient } from "@nihplod/sso-sdk";

const sso = new SsoClient({
  clientId: "your-client-id",
  redirectUri: "https://yourapp.com/callback",
  ssoBaseUrl: "https://nihplod.cn",
});

// 1. Initiate login
await sso.login();

// 2. Handle callback (inside the callback page)
const token = await sso.handleCallback(window.location.href);

// 3. Get user info
const user = await sso.getUserInfo();

// 4. Logout
await sso.logout();
```

---

## API Reference

### `new SsoClient(config)`

Create an SSO client instance.

| Parameter | Type | Required | Description |
|------|------|------|------|
| `clientId` | `string` | ✅ | OAuth Client ID |
| `redirectUri` | `string` | ✅ | Callback URL, must match the one registered |
| `ssoBaseUrl` | `string` | ✅ | SSO provider base URL, e.g. `https://nihplod.cn` |
| `scopes` | `string` | ❌ | Space-separated scopes, default `"openid profile"` |
| `clientSecret` | `string` | ❌ | **Only for Confidential Clients**. Do NOT pass this in browser SPA (Public Client) to avoid leaking secrets. BFF / Next.js Route Handlers may pass it. |

### `sso.login(returnUrl?)`

Initiate SSO login. Generates PKCE parameters and redirects to the SSO login page.

| Parameter | Type | Description |
|------|------|------|
| `returnUrl` | `string` | Optional URL to return to after login |

### `sso.getLoginUrl(returnUrl?)`

Build the login URL string without redirecting. Returns `Promise<string>`.

### `sso.handleCallback(callbackUrl)`

Handle the OAuth callback. Parses `code` and `state` from the URL, validates state, and exchanges the code for tokens.

| Parameter | Type | Description |
|------|------|------|
| `callbackUrl` | `string` | Full callback URL (`window.location.href`) |

Returns `Promise<TokenData>`.

### `sso.refreshToken()`

Refresh the access_token using the refresh_token. Uses a mutex to prevent concurrent refresh requests.

Returns `Promise<TokenData>`.

### `sso.getUserInfo()`

Fetch current user info. Automatically refreshes the access_token if expired.

Returns `Promise<SsoUser>`.

```typescript
interface SsoUser {
  sub: string;
  nickname?: string;
  avatar?: string;
  phone?: string;          // Masked phone number
  membership_level?: string;
  total_points?: number;
}
```

### `sso.getAccessToken()`

Get the current valid access_token. Automatically refreshes if expired.

Returns `Promise<string | null>`.

### `sso.isAuthenticated()`

Check whether the user is authenticated (local check only, no network request).

Returns `boolean`.

### `sso.logout(redirectToSso?)`

Clear local token data and attempt to revoke the server-side refresh_token.

| Parameter | Type | Default | Description |
|------|------|------|------|
| `redirectToSso` | `boolean` | `false` | Whether to redirect to the SSO logout page (OIDC RP-Initiated Logout) |

When `redirectToSso=true`, the user is redirected to `/logout?client_id=...&post_logout_redirect_uri=...`. The main site clears the session and then returns to the sub-project callback address.

### `sso.getDiscovery()`

Fetch the OIDC Discovery document.

Returns `Promise<OidcDiscovery>`.

---

## TypeScript Types

```typescript
// SsoClient config
interface SsoClientConfig {
  clientId: string;
  redirectUri: string;
  ssoBaseUrl: string;
  scopes?: string;
  clientSecret?: string; // Only for Confidential Clients
}

// Token data
interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token?: string;
  issued_at: number;
  expires_at: number;
}

// User info
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

## React Bindings

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
  refreshThreshold={60}  // Auto-refresh 60s before expiry
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
  client,            // SsoClient instance
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

// Render this component in the callback route
export default function AuthCallback() {
  return <CallbackPage />;
}
```

---

## Next.js Bindings

For Next.js, the recommended approach is **Middleware + Route Handler** BFF pattern. Tokens are stored in `httpOnly` cookies so JavaScript cannot read them, providing the highest security.

```typescript
// src/middleware.ts
import { createSsoMiddleware } from "@nihplod/sso-sdk/next";

export const middleware = createSsoMiddleware({
  clientId: "...",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
  scopes: "openid profile",
  publicPaths: ["/", "/public"],
  // Confidential Client (BFF) can pass clientSecret
  // clientSecret: process.env.SSO_CLIENT_SECRET,
  // validateSsoCookie defaults to true: the middleware calls the introspection
  // endpoint to verify the SSO session cookie. Set to false only if you accept
  // "cookie exists = logged in" semantics (lowest latency, but may pass revoked
  // sessions). Either way, the middleware is only a UX gate — always re-verify
  // tokens in Route Handlers / Server Components before serving sensitive data.
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
  // Same as middleware; Confidential Client can pass clientSecret
});
```

```typescript
// src/app/api/auth/logout/route.ts
import { createLogoutRouteHandler } from "@nihplod/sso-sdk/next";

const handler = createLogoutRouteHandler({
  clientId: "...",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
  postLogoutRedirectUri: "https://yourapp.com/",
  redirectToSso: true,
});

// Prefer POST to trigger logout (prevents logout CSRF via cross-site GET);
// GET is kept for compatibility with plain <a> navigations.
export const GET = handler;
export const POST = handler;
```

Trigger the logout endpoint with a POST request (recommended):

```tsx
<button onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => location.assign("/"))}>
  Logout
</button>
```

A plain `<a href="/api/auth/logout">` still works via GET, but note it can be triggered cross-site (logout CSRF).

### Cookie Configuration

Default cookie names:

| Cookie | Default Name | Description |
|--------|--------------|-------------|
| access_token | `__Host-nihplod_sso_at` | Requires Secure + Path=/ + no Domain |
| refresh_token | `__Host-nihplod_sso_rt` | Requires Secure + Path=/ + no Domain |
| state | `__Host-nihplod_sso_state` | Requires Secure + Path=/ + no Domain |
| return_url | `__Host-nihplod_sso_return` | Requires Secure + Path=/ + no Domain |
| verifier | `__Secure-nihplod_sso_verifier` | Requires Secure + no Domain; Path is the callback path, therefore uses `__Secure-` prefix |

> For local development with `http://localhost`, the browser will reject `Secure` cookies. You may disable `secure` locally, but HTTPS is mandatory in production.

---

## Security Recommendations and Token Storage

By default, the SDK stores tokens in **memory**. Public Clients (SPA / mobile / desktop) should **never** write the `refresh_token` to `localStorage` to prevent XSS from stealing long-lived credentials.

Transient OAuth data (PKCE `code_verifier`, `state`, `returnUrl`, popup nonce) is stored separately in **sessionStorage**, because it must survive the full-page redirect to the SSO center and back; it is cleared automatically when the tab closes. In SSR environments without `sessionStorage`, it falls back to an in-memory map.

If the sub-project is a **Next.js BFF / Confidential Client**, you can store tokens in `localStorage` for multi-tab sharing:

```typescript
import { setTokenStorage, createSecureStorage } from "@nihplod/sso-sdk";

setTokenStorage(createSecureStorage({ persist: true }));
```

In production, it is more secure to keep the refresh token in a Service Worker or HTTP-only cookie, exposing only the short-lived access token to the frontend.

---

## Utility Functions

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

// Custom token storage (default is memory storage)
setTokenStorage(createSecureStorage({ persist: false }));
```
