# @nihplod/sso-verify

NIHPLOD SSO token verification toolkit — for sub-projects to validate access tokens issued by the main site backend.

## Install

```bash
npm install @nihplod/sso-verify
```

## Usage

### Method 1: Introspection (Recommended)

Suitable for all sub-projects; no signing keys required.

#### Confidential Client (server-side or BFF)

```typescript
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

const payload = await verifier.verify(token);
if (payload) {
  console.log(payload.sub); // User ID
}
```

#### Public Client (SPA / mobile / desktop)

Public Clients have no `client_secret`. The introspection endpoint still accepts verification with `client_id` only.

```typescript
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
  clientId: "your-public-client-id",
  audience: "your-public-client-id",
  issuer: "https://nihplod.cn",
});

const payload = await verifier.verify(token);
```

### Method 2: Local JWT Verification (Internal Confidential Clients Only)

Only use this when the sub-project shares `JWT_ACCESS_SECRET` with the main site.

```typescript
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  accessTokenSecret: process.env.JWT_ACCESS_SECRET,
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

const payload = await verifier.verify(token);
```

## Express / Connect Middleware

```typescript
import { ssoMiddleware } from "@nihplod/sso-verify";

app.use(
  "/api/protected",
  ssoMiddleware({
    introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
    clientId: "your-client-id",
    clientSecret: "your-client-secret",
    audience: "your-client-id",
  })
);
```

After successful verification, the token payload is attached to `req.user`.

## Notes

- The main site signs access tokens with **RS256 when `JWT_ACCESS_PRIVATE_KEY` is configured (recommended, enables local verification via JWKS)**, and falls back to HS256 symmetric signing when it is not. For external sub-projects, we recommend verifying access tokens via **Introspection** regardless of the signing algorithm — it always works and reflects revocations in real time.
- If your sub-project is an internal service and the main site has RS256 enabled, you can configure `accessTokenPublicKey` or `jwksUri` for local JWT verification.
- **Never distribute `JWT_ACCESS_SECRET` (the HS256 symmetric key) to external sub-projects.** `accessTokenSecret` local verification only applies to internal services that legitimately share the HS256 secret.

## Advanced Options

| Option | Default | Description |
| --- | --- | --- |
| `introspectCacheTtl` | `30000` | Cache TTL (ms) for `active: true` introspection results |
| `introspectNegativeCacheTtl` | `5000` | Cache TTL (ms) for `active: false` results; set `0` to disable caching of revoked/invalid tokens |
| `introspectTimeoutMs` | `10000` | Introspection request timeout (ms); a timeout is treated as verification failure |
| `introspectRetries` | `1` | Retries for introspection requests on network errors / 5xx (short backoff); 4xx is never retried; set `0` to disable |
| `clockToleranceSeconds` | `60` | Clock skew tolerance (seconds) applied to all local JWT verification paths (HS256 / RS256 / logout token) |
| `accessTokenPublicKey` | — | RS256 public key (PEM) for local access token verification |
| `jwksUri` | — | JWKS endpoint URL; public keys are matched by `kid` |
| `logoutTokenPublicKey` | — | RS256 public key (PEM) for back-channel `logout_token` verification |
| `logoutTokenSecret` | — | HS256 secret for local `logout_token` verification |
| `logoutJtiStore` | — | External store for processed `logout_token` jtis (see "Multi-instance deployments" below) |

### Revocation latency trade-off

Introspection results are cached to reduce latency and load on the main site. This means a revoked access token may remain accepted locally until its cache entry expires. `active: true` results are cached for `introspectCacheTtl` (default 30s); `active: false` results use the much shorter `introspectNegativeCacheTtl` (default 5s), so a previously-invalid token that becomes valid (e.g. re-issued) converges quickly, while revocation of an already-cached token takes at most `introspectCacheTtl`. Lower `introspectCacheTtl` for stronger revocation guarantees at the cost of more introspection calls. Use `verifier.invalidateCache(token)` to evict a specific token immediately.

Concurrent `verify()` calls for the same token share a single in-flight introspection request, and failed requests (network errors / 5xx) are retried once by default — see `introspectRetries`.

### Audience (aud) binding for introspection

When verifying via introspection, the response's audience binding is checked against the configured `audience` (which is the sub-project's `client_id`):

- If the response contains `aud` (string or array), it must include the configured `audience`.
- Otherwise, if the response contains `client_id`, it must equal the configured `audience`.
- If the endpoint returns neither field, the response is trusted as-is (legacy behavior); the main site's introspection endpoint always returns `client_id`, so tokens issued to other clients are rejected.

### Logout token verification

Back-channel `logout_token`s are signed with a dedicated key pair (`kid: logout-token-rs256-v1`), which is **different** from the access token key — do not use `accessTokenPublicKey` for them. Configure `logoutTokenPublicKey` (PEM) or `jwksUri` (keys matched by `kid`). Verification is dispatched by the JWT header `alg`: an RS256 logout token without any matching public key fails closed (returns `null`) instead of silently falling back to HS256; HS256 is only used when `logoutTokenSecret` (or the legacy `accessTokenSecret` fallback) is explicitly configured.

Per OIDC Back-Channel Logout 1.0, a `logout_token` must carry an `exp` claim and an `events` claim whose `http://schemas.openid.net/event/backchannel-logout` member is an object (typically `{}`); tokens failing either check are rejected. Verified `jti`s are replay-guarded per issuer for 10 minutes.

### Multi-instance deployments (logout jti replay store)

By default, processed `logout_token` jtis are kept in an in-process LRU cache — it is emptied on restart and **not shared across instances**, so a replayed logout token could be accepted by another instance. When running multiple instances, inject a shared store (e.g. backed by Redis) via `logoutJtiStore`:

```typescript
const verifier = createTokenVerifier({
  audience: "your-client-id",
  logoutTokenPublicKey: process.env.LOGOUT_TOKEN_PUBLIC_KEY,
  logoutJtiStore: {
    // Both sync and async implementations are supported.
    has: (key) => redis.exists(key).then((n) => n > 0),
    add: (key, ttlSeconds) => redis.set(key, "1", "EX", ttlSeconds),
  },
});
```

`has(key)` reports whether a jti was already processed; `add(key, ttlSeconds)` records it with expiry (the verifier passes 600 seconds, matching the built-in cache).
