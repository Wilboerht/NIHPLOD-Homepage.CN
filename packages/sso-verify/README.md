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
