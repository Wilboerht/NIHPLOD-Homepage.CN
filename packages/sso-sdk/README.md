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
//    Token is persisted to sessionStorage by default, so it survives
//    the full-page redirect back from the SSO center.
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

> ⚠️ Do NOT mix `getLoginUrl()` with `login()` for the same login attempt: both regenerate and overwrite the `state` / PKCE verifier in sessionStorage, so the flow started first will fail with a state mismatch. Use only one entry point per login.

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

When `redirectToSso=true`, the user is redirected to the `end_session_endpoint` from OIDC Discovery (fallback: `/api/oauth/end-session`) with `client_id`, `post_logout_redirect_uri`, `id_token_hint` and `state` parameters. The generated `state` is saved to sessionStorage; the main site clears the session and then returns to the sub-project callback address. Validate the `state` on the return page with `sso.validateLogoutState()` to prevent logout CSRF.

### `sso.validateLogoutState(url)`

Validate the `state` parameter of an RP-Initiated Logout redirect-back (logout CSRF protection). Call this on the page that `post_logout_redirect_uri` points to. Returns `true` only when the URL carries a `state` matching the one saved by `sso.logout(true)`; on success the saved state is cleared (one-time).

```typescript
// On the post_logout_redirect_uri page:
if (sso.validateLogoutState(window.location.href)) {
  // Trusted redirect-back from the SSO logout page
}
```

Returns `boolean`.

### `sso.getDiscovery()`

Fetch the OIDC Discovery document.

Returns `Promise<OidcDiscovery | null>` — may be `null` when the discovery endpoint is unreachable and no cached document exists.

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
  error,             // SsoError | null — set when loading user info fails (e.g. session revoked)
  login,             // (returnUrl?: string) => Promise<void>
  logout,            // (redirectToSso?: boolean) => Promise<void>
  refreshUser,       // () => Promise<void>
  getAccessToken,    // () => Promise<string | null>
  client,            // SsoClient instance
} = useSso();
```

Authentication state is three-valued: `isLoading` (initializing/refreshing) → `error` (load failed, e.g. session expired) → `user` (authenticated). Render your UI accordingly.

### `<RequireAuth>`

```tsx
import { RequireAuth } from "@nihplod/sso-sdk/react";

<RequireAuth>
  <ProtectedContent />
</RequireAuth>
```

If starting the login flow fails (e.g. the user closes the popup, `popup_closed`), the component resets its internal trigger flag and shows a retry entry point instead of getting stuck on "please log in". Use `onError` to observe the failure and `renderLoginError(error, retry)` to customize the UI.

```tsx
<RequireAuth
  autoLogin
  usePopup
  onError={(err) => console.warn("login failed", err)}
  renderLoginError={(err, retry) => (
    <button onClick={retry}>登录未完成，点击重试</button>
  )}
>
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

By default the component performs a full-page redirect (`window.location.href`) to the saved `returnUrl` (or `/`) after the token exchange — safe because tokens are persisted to sessionStorage by default. For SPAs that prefer router navigation (no page reload, app state preserved), pass `onSuccess` to take over the redirect; `onError` / `renderError` customize failure handling:

```tsx
function CallbackRoute() {
  const navigate = useNavigate();
  return (
    <CallbackPage
      onSuccess={(tokenData) => navigate("/dashboard", { replace: true })}
      onError={(err) => console.warn("sso callback failed", err)}
      renderError={(message) => <MyErrorPage message={message} />}
    />
  );
}
```

The default error UI is also exported as `DefaultCallbackError` if you want to reuse it.

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
  publicPaths: ["/", "/public", "/api/auth/logout"],
  // Confidential Client (BFF) can pass clientSecret
  // clientSecret: process.env.SSO_CLIENT_SECRET,
  // validateSsoCookie defaults to true: the middleware calls the introspection
  // endpoint to verify the SSO session cookie. Set to false only if you accept
  // "cookie exists = logged in" semantics (lowest latency, but may pass revoked
  // sessions). Either way, the middleware is only a UX gate — always re-verify
  // tokens in Route Handlers / Server Components before serving sensitive data.
  // insecureLocalDev: false by default; set true ONLY for http://localhost
  // development (disables the Secure cookie attribute and strips __Host-/__Secure-
  // prefixes, which browsers refuse to write over HTTP). Must be set consistently
  // on the middleware, callback and logout handlers. Never enable in production —
  // as a safety guard, the option is force-ignored (with a warning) when
  // NODE_ENV=production and ssoBaseUrl uses https, keeping cookies secure.
});

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
```

> **Token expiry behavior (expected):** the middleware does NOT refresh tokens. When the
> `access_token` cookie expires or fails introspection, the middleware clears it and
> redirects to `/api/oauth/authorize`. Because the user still holds an SSO session on the
> main site, the authorize endpoint immediately redirects back with a fresh authorization
> code (silent re-auth), and the callback handler issues new cookies — the user typically
> only sees a quick redirect loop through the SSO center. No client-side action is needed.

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

> For local development with `http://localhost`, browsers reject `Secure` cookies — and cookies named with `__Host-`/`__Secure-` prefixes are refused outright when `Secure` is missing (Chrome, Edge and Firefox all enforce this; behavior on `localhost` varies by browser, some treat it as a secure context for `Secure` cookies, none accept prefixed names without `Secure`). The visible symptom: the login callback appears to succeed but the cookies are never written, so the middleware keeps judging you as logged out and redirects to the SSO authorize page in an infinite loop. Fix: set `insecureLocalDev: true` on `createSsoMiddleware`, `createCallbackRouteHandler` and `createLogoutRouteHandler` (it disables `Secure` and strips the prefixes, with a startup warning), or serve local dev over HTTPS. HTTPS is mandatory in production — and as a production guard, all three helpers force-ignore `insecureLocalDev` (keeping `Secure` and the `__Host-`/`__Secure-` prefixes, with a warning) when `NODE_ENV=production` and `ssoBaseUrl` uses HTTPS.

---

## Security Recommendations and Token Storage

By default, the SDK stores tokens in **sessionStorage** (tab-scoped persistence). This keeps the login state across page reloads and the full-page redirect that `CallbackPage` performs after the token exchange, while the data is cleared automatically when the tab closes and is never shared with other tabs. In SSR environments or privacy modes where `sessionStorage` is unavailable/unwritable, it falls back to an in-memory map (login state is lost on reload in that case).

> ⚠️ XSS note: any token readable by JavaScript can be stolen by XSS. sessionStorage narrows the exposure compared with `localStorage` (tab-scoped, auto-cleared), but a `refresh_token` readable by JS is still exfiltratable while the tab is open. If you need stronger guarantees, use the Next.js BFF pattern below (tokens in `httpOnly` cookies) or keep the refresh token inside a Service Worker.

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

// Custom token storage (default is sessionStorage; persist: true → localStorage)
setTokenStorage(createSecureStorage({ persist: false }));
```
