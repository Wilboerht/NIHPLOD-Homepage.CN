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

- 当前主站默认使用 HS256 对称签名。对于外部子项目，推荐优先使用 **Introspection 模式** 验证 access_token。
- 若你的子项目是内部服务且已与主站共享 RS256 公钥，可配置 `accessTokenPublicKey` 或 `jwksUri` 做本地 JWT 验证。
- **不要将 `JWT_ACCESS_SECRET`（HS256 对称密钥）分发给外部子项目。**
