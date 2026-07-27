# @nihplod/sso-verify

NIHPLOD 一网通 SSO Token 验证工具包 — 供子项目在后端验证主站签发的 Access Token。

## 安装

```bash
npm install @nihplod/sso-verify
```

## 使用方式

### 方式一：Introspection 验证（推荐）

适用于所有子项目，无需接触签名密钥。

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
  console.log(payload.sub); // 用户 ID
}
```

### 方式二：本地 JWT 验证（仅内部 Confidential Client）

仅当子项目与主站共享 `JWT_ACCESS_SECRET` 时使用。

```typescript
import { createTokenVerifier } from "@nihplod/sso-verify";

const verifier = createTokenVerifier({
  accessTokenSecret: process.env.JWT_ACCESS_SECRET,
  audience: "your-client-id",
  issuer: "https://nihplod.cn",
});

const payload = await verifier.verify(token);
```

## Express / Connect 中间件

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

验证成功后，`req.user` 会挂载 token payload。

## 注意事项

- 当前主站使用 HS256 对称签名，JWKS 端点不公开签名密钥，因此**不能通过 JWKS 做本地验证**。
- 未来主站迁移到 RS256 非对称签名后，将支持通过 JWKS 公钥本地验证。
