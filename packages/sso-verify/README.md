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

- The main site currently uses HS256 symmetric signing by default. For external sub-projects, we recommend verifying access tokens via **Introspection**.
- If your sub-project is an internal service and already shares the RS256 public key with the main site, you can configure `accessTokenPublicKey` or `jwksUri` for local JWT verification.
- **Never distribute `JWT_ACCESS_SECRET` (the HS256 symmetric key) to external sub-projects.**

## Advanced Options

| Option | Default | Description |
| --- | --- | --- |
| `introspectCacheTtl` | `30000` | Cache TTL (ms) for `active: true` introspection results |
| `introspectNegativeCacheTtl` | `5000` | Cache TTL (ms) for `active: false` results; set `0` to disable caching of revoked/invalid tokens |
| `introspectTimeoutMs` | `10000` | Introspection request timeout (ms); a timeout is treated as verification failure |
| `accessTokenPublicKey` | — | RS256 public key (PEM) for local access token verification |
| `jwksUri` | — | JWKS endpoint URL; public keys are matched by `kid` |
| `logoutTokenPublicKey` | — | RS256 public key (PEM) for back-channel `logout_token` verification |
| `logoutTokenSecret` | — | HS256 secret for local `logout_token` verification |

### Revocation latency trade-off

Introspection results are cached to reduce latency and load on the main site. This means a revoked access token may remain accepted locally until its cache entry expires. `active: true` results are cached for `introspectCacheTtl` (default 30s); `active: false` results use the much shorter `introspectNegativeCacheTtl` (default 5s), so a previously-invalid token that becomes valid (e.g. re-issued) converges quickly, while revocation of an already-cached token takes at most `introspectCacheTtl`. Lower `introspectCacheTtl` for stronger revocation guarantees at the cost of more introspection calls. Use `verifier.invalidateCache(token)` to evict a specific token immediately.

### Logout token verification

Back-channel `logout_token`s are signed with a dedicated key pair (`kid: logout-token-rs256-v1`), which is **different** from the access token key — do not use `accessTokenPublicKey` for them. Configure `logoutTokenPublicKey` (PEM) or `jwksUri` (keys matched by `kid`). Verification is dispatched by the JWT header `alg`: an RS256 logout token without any matching public key fails closed (returns `null`) instead of silently falling back to HS256; HS256 is only used when `logoutTokenSecret` (or the legacy `accessTokenSecret` fallback) is explicitly configured. Verified `jti`s are replay-guarded per issuer for 10 minutes.
