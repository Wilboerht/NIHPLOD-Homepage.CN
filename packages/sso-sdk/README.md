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

### `sso.login(returnUrl?, options?)`

Initiate SSO login. Generates PKCE parameters and redirects to the SSO login page.

| Parameter | Type | Description |
|------|------|------|
| `returnUrl` | `string` | Optional URL to return to after login |
| `options.prompt` | `"none" \| "login" \| "consent"` | Optional OIDC `prompt` parameter, passed through to the authorize URL |

### `sso.getLoginUrl(returnUrl?, options?)`

Build the login URL string without redirecting. Returns `Promise<string>`. Accepts the same `options.prompt` as `login()`.

> ⚠️ Do NOT mix `getLoginUrl()` with `login()` for the same login attempt: both regenerate and overwrite the `state` / PKCE verifier in sessionStorage, so the flow started first will fail with a state mismatch. Use only one entry point per login.

#### Silent session probe (`prompt: "none"`)

Passing `prompt: "none"` starts a **silent probe**: if the user still has a session on the SSO center, the authorize endpoint redirects straight back with a code and login completes without UI; if not, the IdP redirects back with `error=login_required` (or `consent_required` / `interaction_required`). When you start the probe via `login()` / `getLoginUrl()`, the SDK records a probe marker alongside `state`; `handleCallback()` then recognizes the matching error callback, cleans up the transient data and returns `null` instead of throwing — treat `null` as "no SSO session". The default `<CallbackPage>` redirects back to your `returnUrl` with `sso_probe=no_session` appended.

```typescript
// Triggered by an explicit user action (e.g. clicking "继续 NIHPLOD 账户"):
await sso.login("/dashboard", { prompt: "none" });

// On the page returnUrl points to:
const params = new URLSearchParams(location.search);
if (params.get("sso_probe") === "no_session") {
  // No SSO session — fall back to the normal interactive login button
}
```

> ⚠️ Do NOT auto-probe on page load: it round-trips every visitor through the SSO center and adds latency for users without a session. Always trigger it from a deliberate user action (click).

### `sso.handleCallback(callbackUrl)`

Handle the OAuth callback. Parses `code` and `state` from the URL, validates state, and exchanges the code for tokens. When the requested scope includes `openid`, the token response **must** contain an `id_token` (fail-closed: a missing `id_token` is rejected instead of silently skipping validation). The SDK verifies the ID Token's signature, issuer, audience, expiry and `at_hash`, and — when the login was initiated via `login()` / `getLoginUrl()` / `loginPopup()` — also validates the OIDC `nonce` claim against the value generated at login time (constant-time comparison, protecting against ID Token replay; the check is skipped if no nonce is stored, e.g. when the Next.js nonce cookie has expired).

| Parameter | Type | Description |
|------|------|------|
| `callbackUrl` | `string` | Full callback URL (`window.location.href`) |

Returns `Promise<TokenData | null>` — `null` only when a silent probe (`prompt: "none"`) finds no SSO session (see above).

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
  total_spent?: number;    // 累计消费金额（元），来自 membership scope
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
  total_spent?: number;
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
    debug: false,            // Optional: verbose SDK logs ([SSO SDK] prefix)
  }}
  refreshThreshold={60}      // Auto-refresh 60s before expiry
  onTokenRefreshed={(token) => { /* sync token elsewhere */ }}
  onSessionExpired={(err) => { /* show "session expired, please sign in again" */ }}
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
  sessionExpired,    // boolean — refresh_token revoked/expired; survives "no local token" reloads
  login,             // (returnUrl?: string) => Promise<void>
  loginPopup,        // (options?: { returnUrl?; width?; height? }) => Promise<TokenData>
  logout,            // (redirectToSso?: boolean) => Promise<void>
  refreshUser,       // () => Promise<void>
  getAccessToken,    // () => Promise<string | null>
  client,            // SsoClient instance
} = useSso();
```

Authentication state is three-valued: `isLoading` (initializing/refreshing) → `error` (load failed, e.g. session expired) → `user` (authenticated). Render your UI accordingly.

`sessionExpired` turns `true` when refresh fails because the token was revoked/expired; unlike `error` it is **not** cleared when the local token has already been removed, so you can reliably show a "登录已过期，请重新登录" banner. It resets on successful login or explicit `logout()`.

`loginPopup` keeps the current page state (no full-page redirect) and returns the exchanged token data; the callback tab notifies the opener via `postMessage` with a one-time nonce. If the browser blocks the popup, catch the `popup_blocked` error and fall back to `login()`.

Cross-tab sync: `logout()` and silent token rotation broadcast over `BroadcastChannel`, so other tabs update immediately even though the default token storage is `sessionStorage` (a raw `storage` event does not fire for `sessionStorage`; the listener only helps when you opt into `createSecureStorage({ persist: true })`).

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

> **Introspection outage behavior (since 1.4.1):** introspection requests time out after
> 5s. When introspection is *unreachable* (network error, timeout, or 5xx — as opposed to
> a confirmed-invalid token), the middleware fails open for requests that already carry an
> SSO `access_token` cookie: it lets the request through (with one `console.warn`) instead
> of redirecting to an SSO center that is likely down. This is safe because the middleware
> is only a UX gate — Route Handlers / Server Components must still re-verify the token.
> Confirmed-invalid tokens (401/403 or `active:false`) still trigger the redirect, and
> requests without any SSO cookie still redirect as before.

```typescript
// src/app/api/auth/callback/route.ts
import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";

export const GET = createCallbackRouteHandler({
  clientId: "...",
  ssoBaseUrl: "https://nihplod.cn",
  redirectUri: "https://yourapp.com/api/auth/callback",
  defaultReturnPath: "/dashboard",
  // Optional but recommended: keep in sync with createSsoMiddleware's `scopes`.
  // Only when explicitly set AND it includes `openid` does the callback require an
  // id_token (fail-closed). If omitted, legacy-compatible behavior applies: the ID
  // token is validated when present but its absence is not rejected, so upgrading
  // apps that didn't configure scopes keep working.
  scopes: "openid profile",
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
  // Logout scope: "local" (default) only signs out of THIS site (revoke
  // refresh_token + clear cookies, redirect to the site home page);
  // "global" additionally redirects to the SSO end-session endpoint to
  // sign out of all NIHPLOD platforms (RP-Initiated Logout).
  defaultScope: "local",
});

// Prefer POST to trigger logout (prevents logout CSRF via cross-site GET);
// a GET without a valid logout state does NOT log out — it returns a
// confirmation page (HTML) whose form POSTs to the same endpoint.
export const GET = handler;
export const POST = handler;
```

**Logout scopes (default changed):** the GET confirmation page now includes a "同时退出所有 NIHPLOD 平台" checkbox; when checked, the form POSTs `global=1` and the handler performs a global logout (end-session redirect) regardless of `defaultScope`. A POST without a `global` field uses `defaultScope`. If you trigger logout from your own fetch call, add `global=1` to the form body to opt into a global logout.

> **Migration:** `redirectToSso` is deprecated and logs a one-time warning. `redirectToSso: true` → `defaultScope: "global"`; `redirectToSso: false` → `defaultScope: "local"`. Note the default changed from "redirect to SSO" to **local logout** — pass `defaultScope: "global"` to keep the old behavior.

```typescript
// src/app/api/auth/backchannel-logout/route.ts
import { createBackchannelLogoutRouteHandler } from "@nihplod/sso-sdk/next";

export const POST = createBackchannelLogoutRouteHandler({
  clientId: "...",
  ssoBaseUrl: "https://nihplod.cn",
  onLogout: async ({ sub, sid }) => {
    // Clear your own server-side session for this user/session
  },
});
```

The backchannel handler receives `logout_token` pushes from the SSO center (OIDC Back-Channel Logout) when the user signs out globally or revokes consent, verifies the token (RS256 signature via JWKS, issuer/audience/expiry, `events` claim, `jti` replay protection), clears the SSO cookies, and calls your `onLogout` hook. If the hook throws, it responds 500 so the IdP retries delivery. **Remember to register this route's public URL as `backchannelLogoutUri` in the SSO admin console for your client.**

Trigger the logout endpoint with a POST request (recommended):

```tsx
<button onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => location.assign("/"))}>
  Logout
</button>
```

A plain `<a href="/api/auth/logout">` navigation (GET) renders the built-in confirmation page instead of logging out directly, so cross-site image/prefetch requests can no longer trigger a logout (logout CSRF protection). Only a POST — or a GET carrying a valid RP-Initiated Logout `state` — performs the logout.

### Cookie Configuration

Default cookie names:

| Cookie | Default Name | Description |
|--------|--------------|-------------|
| access_token | `__Host-nihplod_sso_at` | Requires Secure + Path=/ + no Domain |
| refresh_token | `__Host-nihplod_sso_rt` | Requires Secure + Path=/ + no Domain |
| state | `__Host-nihplod_sso_state` | Requires Secure + Path=/ + no Domain |
| nonce | `__Host-nihplod_sso_nonce` | OIDC nonce for ID Token replay protection. Validated when the nonce cookie is present (cookie TTL 10 minutes); if the cookie has expired, the nonce check is skipped. Requires Secure + Path=/ + no Domain |
| id_token | `__Host-nihplod_sso_id` | ID token cookie used as `id_token_hint` for RP-Initiated Logout. Requires Secure + Path=/ + no Domain |
| logout_state | `__Host-nihplod_sso_logout_state` | One-time logout state for CSRF protection on the RP-Initiated Logout callback. Requires Secure + Path=/ + no Domain |
| return_url | `__Host-nihplod_sso_return` | Requires Secure + Path=/ + no Domain |
| verifier | `__Secure-nihplod_sso_verifier` | Requires Secure + no Domain; Path is the callback path, therefore uses `__Secure-` prefix |

> In the Next.js BFF flow, the transient cookies above (`state`, `nonce`, `return_url`, `verifier`) are written with the per-login `state` as a name suffix (e.g. `__Host-nihplod_sso_state_<state>`) and looked up by the `state` returned from the IdP. This keeps concurrent tabs from overwriting each other's login attempt. The legacy unsuffixed names are still accepted as a fallback during rolling upgrades.

> For local development with `http://localhost`, browsers reject `Secure` cookies — and cookies named with `__Host-`/`__Secure-` prefixes are refused outright when `Secure` is missing (Chrome, Edge and Firefox all enforce this; behavior on `localhost` varies by browser, some treat it as a secure context for `Secure` cookies, none accept prefixed names without `Secure`). The visible symptom: the login callback appears to succeed but the cookies are never written, so the middleware keeps judging you as logged out and redirects to the SSO authorize page in an infinite loop. Fix: set `insecureLocalDev: true` on `createSsoMiddleware`, `createCallbackRouteHandler` and `createLogoutRouteHandler` (it disables `Secure` and strips the prefixes, with a startup warning), or serve local dev over HTTPS. HTTPS is mandatory in production — and as a production guard, all three helpers force-ignore `insecureLocalDev` (keeping `Secure` and the `__Host-`/`__Secure-` prefixes, with a warning) when `NODE_ENV=production` and `ssoBaseUrl` uses HTTPS.

---

## Security Recommendations and Token Storage

By default, the SDK stores tokens in **sessionStorage** (tab-scoped persistence). This keeps the login state across page reloads and the full-page redirect that `CallbackPage` performs after the token exchange, while the data is cleared automatically when the tab closes and is never shared with other tabs. In SSR environments or privacy modes where `sessionStorage` is unavailable/unwritable, it falls back to an in-memory map (login state is lost on reload in that case).

> ⚠️ XSS note: any token readable by JavaScript can be stolen by XSS. sessionStorage narrows the exposure compared with `localStorage` (tab-scoped, auto-cleared), but a `refresh_token` readable by JS is still exfiltratable while the tab is open. If you need stronger guarantees, use the Next.js BFF pattern below (tokens in `httpOnly` cookies) or keep the refresh token inside a Service Worker.

Transient OAuth data (PKCE `code_verifier`, `state`, OIDC `nonce`, `returnUrl`, popup nonce) is stored separately in **sessionStorage**, because it must survive the full-page redirect to the SSO center and back; it is cleared automatically when the tab closes. In SSR environments without `sessionStorage`, it falls back to an in-memory map.

If the sub-project is a **Next.js BFF / Confidential Client**, you can store tokens in `localStorage` for multi-tab sharing:

```typescript
import { setTokenStorage, createSecureStorage } from "@nihplod/sso-sdk";

setTokenStorage(createSecureStorage({ persist: true }));
```

In production, it is more secure to keep the refresh token in a Service Worker or HTTP-only cookie, exposing only the short-lived access token to the frontend.

---

## Error Codes

All SDK failures are thrown as `SsoError` (`error.code` / `error.description`; `error.message` is `[SSO SDK] <code>: <description>`).

| Code | Meaning | Typical handling |
| --- | --- | --- |
| `invalid_config` | Missing/invalid config (clientId, redirectUri, ssoBaseUrl), or middleware/callback config mismatch | Fix configuration; check `insecureLocalDev` and cookie names are identical everywhere |
| `state_mismatch` | OAuth `state` mismatch (CSRF protection) | Restart login; never ignore |
| `pkce_required` | PKCE verifier missing (expired tab / different tab) | Restart login |
| `authorization_code_expired` / `authorization_code_used` | Code expired or already redeemed | Restart login |
| `user_denied_authorization` | User cancelled on the SSO page | Show a neutral "login cancelled" message |
| `client_disabled` | Client disabled in admin console | Contact administrator |
| `account_disabled` | User account disabled | Show reason, contact support |
| `session_expired` / `no_refresh_token` | Refresh token revoked/expired | Clear local state and ask the user to sign in again (`sessionExpired` is set on `SsoProvider`) |
| `network_error` | Network failure or request timeout (10s; revoke 3s) | Show retry; keep local tokens for retryable cases |
| `rate_limited` | Server rate limit | Back off and retry later |
| `sso_server_error` | SSO server error | Retry later |
| `popup_blocked` | `window.open` blocked | Fall back to full-page `login()` |
| `popup_closed` | User closed the login popup | Offer retry |
| `id_token_*` (`id_token_invalid`, `..._signature`, `..._nonce_mismatch`, `..._at_hash_mismatch`, …) | ID token missing or failed validation (fail-closed) | Restart login; if persistent, check `scopes` parity between middleware and callback |
| `logout_token_*` | Back-channel logout token validation failed | Return 400/500 so the IdP retries; check clock skew/JWKS |
| `not_authenticated` | No local token when calling user APIs | Trigger login |

Next.js callback errors are rendered as a branded HTML page for browser navigations (with a "重新登录" action). Programmatic callers can force JSON with `?format=json` or an `Accept` header that excludes `text/html`. Customize the page with the `renderErrorPage` option; enable `debug: true` for server-side error logs.

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
