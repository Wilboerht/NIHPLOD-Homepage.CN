# 一网通 SSO 功能完备性实施与自检清单

## 背景

本项目定位为 NIHPLOD 品牌统一的 Single Sign-On (SSO) 身份认证中心。当前微信 OAuth 跨子站登录流程（`src/app/api/auth/wechat/route.ts`、`src/app/api/auth/wechat/callback/route.ts`、`src/lib/jwt.ts` 中 wechat_exchange_token）已实现 OAuth 2.0 授权码模式雏形。

- **方案 B**：将现有仅限微信的跨站登录泛化为通用 OAuth 2.0 授权码模式，主站为 Authorization Server
- **方案 C**：子项目通过 JWKS 公钥本地验证主站签发的 Access Token，无需每次回调主站
- **信任基础**：内部 API v1 安全层（HMAC-SHA256 签名，`src/lib/internal-api.ts`）
- **用户模型**：`prisma/schema.prisma` User 表支持 ACTIVE/SUSPENDED/BANNED 三态管理、RefreshToken 设备绑定（`src/lib/auth-security.ts`）、auth_logger 审计链路（`src/lib/auth-logger.ts`）

---

## Phase 1 — 基础 SSO（收尾清单）

> Phase 1 已在前序对话中完成基础注册（移除邀请码）和框架分析。以下列出待收尾项和已完成项的验收标准。

### P1-R1：已完成项验收

| 编号 | 已完成项 | 文件 | AC |
|------|----------|------|-----|
| P1-DONE-1 | 移除邀请码强制要求 | `src/components/website/auth/RegisterForm.tsx` | `grep -r "inviteCode\|hasInvite" src/components/ --include="*.tsx"` 返回 0 结果 |
| P1-DONE-2 | 注册 API 请求体无 inviteCode | `src/components/website/AuthModal.tsx` | POST /api/auth/register 的 body 不含 inviteCode 字段 |
| P1-DONE-3 | 内部 API v1 框架 | `src/lib/internal-api.ts` | HMAC-SHA256 签名验证测试通过（`src/lib/__tests__/internal-api.test.ts` 全部 green） |
| P1-DONE-4 | 微信跨子站 SSO 雏形 | `src/app/api/auth/wechat/route.ts`, `src/app/api/auth/wechat/callback/route.ts` | advisor 子站可通过 `callback` 参数完成微信登录并获取 exchange_token |

### P1-R2：待收尾项

| 编号 | 步骤 | 文件 | 依赖 | AC |
|------|------|------|------|-----|
| P1-R2-S1 | 生产环境配置独立 JWT Secret | `.env.production` | 无 | `JWT_ADMIN_SECRET`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`JWT_WECHAT_BIND_SECRET`、`JWT_WECHAT_EXCHANGE_SECRET` 各为独立 64 字符 hex 随机值，不与 `JWT_SECRET` 相同。`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成 |
| P1-R2-S2 | 生产环境启用 SMS Provider | `.env.production` | P1-R2-S1 | `SMS_PROVIDER=tencent` 及完整腾讯云 SMS 凭证未注释，`SMS_PROVIDER` 不为 `mock`。验证：`POST /api/auth/send-code` 返回非 mock 结果 |
| P1-R2-S3 | 生产环境启用 Local Cron | `.env.production` | P1-R2-S1 | `ENABLE_LOCAL_CRON=true` 写入。验证：应用启动日志中包含 `[Cron] 共注册 X 个定时任务` |
| P1-R2-S4 | 旧版内部 API 端点添加弃用头 | `src/app/api/internal/wechat/send-template/route.ts` | 无 | 响应头中包含 `Deprecation: true` 和 `Sunset: <ISO 日期>`（建议设为 Phase 2 完成后 30 天） |

---

## Phase 2 — OAuth 2.0 授权码模式 SSO 完整实现

### 模块 A：OAuth 2.0 授权码模式

#### 功能 A1：OAuth Client 数据模型

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-A1-S1 | 新增 OAuthClient Prisma 模型 | `prisma/schema.prisma` | 无 | 运行 `npx prisma migrate dev --name add_oauth_client` 后数据库存在 `OAuthClient` 表，含 clientId (unique string)、clientSecret (string)、name (string)、redirectUris (string[])、scopes (string[])、isActive (boolean)、createdAt、updatedAt 字段 |
| P2-A1-S2 | 新增 OAuthAuthorizationCode Prisma 模型 | `prisma/schema.prisma` | P2-A1-S1 | 数据库存在 `OAuthAuthorizationCode` 表，含 code (unique string)、clientId、userId、redirectUri、scopes、codeChallenge (nullable)、codeChallengeMethod (nullable)、expiresAt、used (boolean) |
| P2-A1-S3 | 实现 OAuth Client CRUD 库函数 | `src/lib/oauth-client.ts`（新建） | P2-A1-S1 | 导出 `createOAuthClient`、`getOAuthClientById`、`getOAuthClientByClientId`、`updateOAuthClient`、`deleteOAuthClient`、`listOAuthClients`。每个函数含 Zod 参数校验 |
| P2-A1-S4 | 实现授权码管理库函数 | `src/lib/oauth-code.ts`（新建） | P2-A1-S2 | 导出 `createAuthorizationCode`（生成 32 字节随机 hex，SHA-256 哈希存储）、`consumeAuthorizationCode`（原子化 set used=true，used=false 时返回 code 记录，否则返回 null）、`cleanupExpiredCodes` |

#### 功能 A2：授权端点 /api/oauth/authorize

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-A2-S1 | 实现 GET /api/oauth/authorize 参数校验 | `src/app/api/oauth/authorize/route.ts`（新建） | P2-A1-S3 | GET 请求校验 query 参数：`response_type=code`（仅支持）、`client_id`（必填，对应 OAuthClient 记录）、`redirect_uri`（必填，必须在 client.redirectUris 数组中精确匹配）、`scope`（必填，空格分隔，每项在 client.scopes 内）、`state`（推荐，原样返回）、`code_challenge`（推荐，PKCE）、`code_challenge_method=S256`（仅支持）。校验失败返回 400 JSON：`{error:"invalid_request",error_description:"..."}` |
| P2-A2-S2 | 实现 redirect_uri 精确匹配校验 | `src/app/api/oauth/authorize/route.ts` | P2-A2-S1 | 使用 `===` 而非 `startsWith` 匹配 redirect_uri。`curl "https://nihplod.cn/api/oauth/authorize?client_id=advisor&redirect_uri=https://advisor.nihplod.cn.evil.com/callback&..."` 返回 400 |
| P2-A2-S3 | 实现 GET 重定向到统一登录页 | `src/app/api/oauth/authorize/route.ts` | P2-A2-S1 | 用户未登录时，302 到 `/login?return_to=/api/oauth/authorize?...`（保留所有原始 query 参数编码到 return_to）。同时校验 `__Host-user_token` Cookie，若有效则跳过登录直接进入 consent |
| P2-A2-S4 | 实现 POST consent 处理与授权码签发 | `src/app/api/oauth/authorize/route.ts` | P2-A2-S3, P2-A1-S4 | POST 请求 body `{ action: "approve" | "deny" }`。approve：调用 `createAuthorizationCode` 生成一次性 code（5 分钟 TTL），302 到 `redirect_uri?code=xxx&state=xxx`。deny：302 到 `redirect_uri?error=access_denied&state=xxx` |
| P2-A2-S5 | 实现 state 参数原样回传 | `src/app/api/oauth/authorize/route.ts` | P2-A2-S4 | 重定向 URL 中 state 参数值与请求中的 state 完全相同。`curl -v "..." 2>&1 | grep "Location:"` 可验证 |
| P2-A2-S6 | 为 /authorize 端点配置限流 | `src/lib/ratelimit.ts` + route.ts | P2-A2-S1 | `RATE_LIMIT_PRESETS` 新增 `oauth-authorize: { maxRequests: 30, windowMs: 60000 }`。route 中调用 `rateLimit(ip, "oauth-authorize")`。超过限制返回 429 |
| P2-A2-S7 | 新增 OAuth 登录页路由 | `src/app/login/page.tsx`（新建） | P2-A2-S3 | 页面读取 `searchParams.return_to`，展示手机号验证码登录、密码登录、微信扫码登录三个 Tab（复用 `src/components/website/AuthModal.tsx` 中的表单组件）。登录成功后 `router.push(return_to)`。**不影响官网前台模态框登录** |

#### 功能 A3：Token 端点 /api/oauth/token

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-A3-S1 | 实现 POST /api/oauth/token — authorization_code grant | `src/app/api/oauth/token/route.ts`（新建） | P2-A1-S3, P2-A1-S4 | POST body `grant_type=authorization_code&code=xxx&client_id=xxx&client_secret=xxx&code_verifier=xxx`。校验 client_secret（bcrypt compare）、校验 code（`consumeAuthorizationCode` 原子化标记 used）、校验 code_verifier（SHA-256(code_verifier) === codeChallenge）。成功返回 `{access_token, token_type:"Bearer", expires_in:900, refresh_token, id_token}`。失败返回 `{error:"invalid_grant",error_description:"..."}` |
| P3-A3-S2 | 实现 POST /api/oauth/token — refresh_token grant | `src/app/api/oauth/token/route.ts` | P3-A3-S1 | `grant_type=refresh_token&refresh_token=xxx&client_id=xxx&client_secret=xxx`。调用 `atomicallyRotateRefreshToken` 完成原子化轮换。返回新的 access_token + refresh_token。旧 refresh_token 被撤销 |
| P3-A3-S3 | 实现 PKCE code_verifier 校验 | `src/app/api/oauth/token/route.ts` | P3-A3-S1 | `code_challenge_method=S256` 时：`crypto.createHash('sha256').update(code_verifier).digest('base64url')` 必须等于 `codeChallenge`。不匹配返回 `error:"invalid_grant"`。`curl -X POST ... -d "code_verifier=wrong"` 返回 400 |
| P3-A3-S4 | 实现授权码一次性使用保证 | `src/lib/oauth-code.ts` | P2-A1-S4 | `consumeAuthorizationCode` 使用 `prisma.oauthAuthorizationCode.updateMany({ where: { code: hash, used: false }, data: { used: true } })`。`count === 0` 时返回 null。**重复使用同一 code 两次调用 /token 的第二次返回 400** |
| P3-A3-S5 | 授权码过期检查 | `src/app/api/oauth/token/route.ts` | P3-A3-S4 | `code.expiresAt < new Date()` 返回 `error:"invalid_grant", error_description:"Authorization code expired"` |
| P3-A3-S6 | 签发 ID Token | `src/lib/jwt.ts` 新增 `signIdToken` 函数 | P3-A3-S1 | `signIdToken({ sub, aud: clientId, ...claims })` 使用独立 `JWT_ID_TOKEN_SECRET` 签发。ID Token JWT 含 `iss`（官网 URL）、`aud`（client_id）、`sub`（用户 ID）、`iat`、`exp`（1 小时）、按 scope 裁剪的 claims（phone/nickname/avatar/membershipLevel）。类型标记为 `type: "id_token"` |
| P3-A3-S7 | 为 /token 端点配置限流 | `src/lib/ratelimit.ts` + route.ts | P3-A3-S1 | `RATE_LIMIT_PRESETS` 新增 `oauth-token: { maxRequests: 60, windowMs: 60000 }` |

#### 功能 A4：UserInfo 端点

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-A4-S1 | 实现 GET /api/oauth/userinfo | `src/app/api/oauth/userinfo/route.ts`（新建） | P3-A3-S6 | 从 `Authorization: Bearer <access_token>` 读取 token，`verifyUserToken` 验证。按 token 中的 `scope` claim 返回用户信息。`scope` 含 `phone` → `phone` 脱敏 `138****1234`；含 `profile` → `nickname` + `avatar`；含 `membership` → `membershipLevel` + `totalPoints`。Bearer token 无效返回 401 `WWW-Authenticate: Bearer error="invalid_token"` |
| P2-A4-S2 | 为 /userinfo 端点配置限流 | `src/lib/ratelimit.ts` + route.ts | P2-A4-S1 | `RATE_LIMIT_PRESETS` 新增 `oauth-userinfo: { maxRequests: 120, windowMs: 60000 }`。超过限制返回 429 |

#### 功能 A5：OAuth Client 管理（管理后台）

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-A5-S1 | 管理端 OAuth Client CRUD API | `src/app/api/admin/oauth-clients/route.ts`（新建） | P2-A1-S3 | GET（分页列表）、POST（创建，自动生成 `clientId = nanoid(24)` 和 `clientSecret = randomBytes(32).toString('base64')`，secret 以 bcrypt 哈希存储，仅在创建时返回明文 secret 一次）。需要 `verifyAuth` + `withRole(["owner"])` 权限 |
| P2-A5-S2 | 管理端单个 Client API | `src/app/api/admin/oauth-clients/[id]/route.ts`（新建） | P2-A5-S1 | GET（详情）、PATCH（更新 redirectUris/scopes/isActive）、DELETE（软删除）。`validateCSRFToken` 检查 |
| P2-A5-S3 | 管理后台 OAuth Client 管理 UI | `src/app/admin/oauth-clients/page.tsx`（新建） | P2-A5-S1, P2-A5-S2 | 表格列出所有 Client（名称、clientId、redirectUris、状态、创建时间）。支持新建/编辑/启用/禁用。创建时弹窗显示一次性 secret（带复制按钮 + "关闭后无法再次查看" 提示） |
| P2-A5-S4 | 内部 API 密钥到 OAuth Client 兼容桥接 | `src/lib/oauth-client.ts` 新增 `getClientByInternalApiKey` | P2-A1-S3 | 现有 Advisor 子站使用 `X-Internal-API-Key` 调用内部 API，此函数按 key 查找对应的 OAuthClient 记录（通过 `INTERNAL_API_KEYS` 环境变量中的 project 名称匹配 client.name）。token 端点同时支持 `client_secret` 和 HMAC 签名两种认证 |

---

### 模块 B：共享 JWT 密钥信任传递（方案 C 入轨）

#### 功能 B1：JWKS 端点

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-B1-S1 | 实现 GET /api/oauth/jwks.json | `src/app/api/oauth/jwks/route.ts`（新建） | P3-A3-S6 | 返回 `{ keys: [{ kty: "oct", kid: "access-token-v1", alg: "HS256", k: "<base64url encoded secret>" }] }`。注意：HS256 对称算法在标准 JWKS 中 kty 应为 "oct"。`curl https://nihplod.cn/api/oauth/jwks.json` 返回有效 JSON，`Content-Type: application/json`，`Cache-Control: public, max-age=3600` |
| P2-B1-S2 | JWKS 响应缓存 | `src/app/api/oauth/jwks/route.ts` | P2-B1-S1 | 使用 Next.js `unstable_cache` 或内存缓存（1 小时 TTL）。P99 延迟 < 50ms |
| P2-B1-S3 | 新增 JWT_ID_TOKEN_SECRET 环境变量 | `.env.production`, `.env.local` | 无 | 环境变量存在且长度 ≥ 32 字符。`src/lib/jwt.ts` 中 `validateSecret("JWT_ID_TOKEN_SECRET", ...)` 启动时校验 |

#### 功能 B2：Access Token 结构调整

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-B2-S1 | signUserToken 新增标准 OAuth claims | `src/lib/jwt.ts` `signUserToken` 函数 | P3-A3-S6 | payload 增加 `iss`（ISSUER）、`aud`（clientId）、`scope`（空格分隔的 scope 字符串）、`client_id`（clientId）、`jti`（随机 UUID，唯一标识）、`type: "access_token"`（区分原有 `"user"` 类型）。**向后兼容**：当 `clientId` 为空时不添加 OAuth claims，保持现有 `/api/user/profile` 等接口正常工作 |
| P2-B2-S2 | verifyUserToken 增加 OAuth claims 校验 | `src/lib/jwt.ts` `verifyUserToken` 函数 | P2-B2-S1 | 当 payload 中 `type === "access_token"` 时，校验 `aud` 是否在允许列表中。`type === "user"` 时保持现有逻辑。不同 type 使用不同 Secret（access_token 用 JWT_ACCESS_SECRET，user 用 JWT_ACCESS_SECRET）——实际上它们共用同一 Secret 但 type 不同，在路由中按需校验 |

#### 功能 B3：子项目本地 Token 验证工具

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-B3-S1 | 发布 `@nihplod/sso-verify` npm 包基础版 | `packages/sso-verify/` (monorepo 内新建，后续发布到 npm) | P2-B1-S1, P2-B2-S1 | 导出 `createTokenVerifier({ jwksUri, audience, issuer })` 函数。内部从 JWKS 端点获取密钥缓存，使用 `jose.jwtVerify` 验证签名、iss、aud、exp。缓存 TTL 可配置 |
| P2-B3-S2 | Token Verifier 中间件 | `packages/sso-verify/src/middleware.ts` | P2-B3-S1 | 导出 Express/Next.js 兼容中间件。自动从 `Authorization: Bearer <token>` 提取 token，验证通过后 `req.user = payload`，失败返回 401 |

---

### 模块 C：单点登出 (SLO) 与会话管理

#### 功能 C1：OAuthSession 数据模型

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-C1-S1 | 新增 OAuthSession Prisma 模型 | `prisma/schema.prisma` | 无 | 数据库存在 `OAuthSession` 表，含 userId、clientId、sessionId (unique)、createdAt、expiresAt、revokedAt (nullable)。索引 `@@index([userId, clientId])`、`@@index([sessionId])` |
| P2-C1-S2 | 新增 OAuthClient.backchannelLogoutUri 字段 | `prisma/schema.prisma` OAuthClient 模型 | P2-A1-S1 | 字段 `backchannelLogoutUri String?`。管理后台创建/编辑时可配置 |

#### 功能 C2：主站登出增强

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-C2-S1 | 登出时撤销 OAuthSession | `src/app/api/auth/logout/route.ts` | P2-C1-S1 | 现有 logout 逻辑后新增：`prisma.oAuthSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })` |
| P2-C2-S2 | 登出时触发 Backchannel Logout | `src/app/api/auth/logout/route.ts` | P2-C1-S2, P2-C2-S1 | 查用户所有未撤销 session 对应的 client，向每个 client 的 `backchannelLogoutUri` POST `{ logout_token: <signed JWT with sub+aud+events+iat+exp+ jti> }`。失败记录日志但不阻塞登出响应。Logout token 使用独立 `JWT_LOGOUT_SECRET` |
| P2-C2-S3 | 实现 Frontchannel Logout iframe | `src/app/logout/confirm/page.tsx`（新建） | P2-C2-S2 | 登出后渲染页面，内含指向所有已注册子站 logout iframe 的 `<iframe>` 标签。子站可通过 `post_logout_redirect_uri` 参数指定登出后跳转 |
| P2-C2-S4 | 子站 Logout Token 验证端点 | `src/app/api/oauth/logout/verify/route.ts`（新建） | P2-C2-S2 | POST 接收 `logout_token`，验证 JWT 签名和 `events` claim 含 `http://schemas.openid.net/event/backchannel-logout`。子站调用此端点确认 logout token 真实性 |

---

### 模块 D：子项目实时感知账户状态变更

#### 功能 D1：账户状态变更通知

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-D1-S1 | 管理员封禁/解冻用户时通知子项目 | `src/app/api/admin/users/[id]/route.ts` PATCH handler | P2-C1-S2, P2-C1-S1 | 状态变更后，查询该用户的活跃 OAuthSession，向各 client 的 `backchannelLogoutUri` POST 通知。若封禁：同时包含 `{ event: "account_disabled", sub: userId, reason: "SUSPENDED|BANNED" }`。若解冻：不发送 logout，仅发送 status change |
| P2-D1-S2 | 增强内部 API user/status 支持批量查询 | `src/app/api/v1/internal/user/status/route.ts` | 无 | 现有 POST 单用户查询不变。新增 `POST { userIds: string[] }` 支持批量查询，返回 `{ users: [{ userId, status, updatedAt }] }`。限流调整为 `maxRequests: 100`（批量查询） |
| P2-D1-S3 | 实现 status 变更 Webhook | `src/lib/webhook.ts`（新建） | P2-D1-S1 | 导出 `dispatchStatusChangeWebhook({ userId, oldStatus, newStatus, source: "admin" })`。向所有已注册 Webhook URL POST JSON。带重试（3 次，指数退避 1s/4s/16s），失败记录到审计日志 |

#### 功能 D2：子项目 Token 验证时实时状态检查

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-D2-S1 | verifyUserToken 增加可选状态检查回调 | `src/lib/jwt.ts` `verifyUserToken` 函数 | 无 | 新增可选参数 `{ checkStatus?: (userId: string) => Promise<boolean> }`。调用方传入 `checkUserStatus` 函数。子项目 SDK 中的 token verifier 在验证 JWT 后调用此回调 |
| P2-D2-S2 | 子项目 SDK 内置状态缓存 | `packages/sso-verify/src/status-cache.ts` | P2-D2-S1 | 内存 LRU 缓存用户状态（TTL 60 秒）。`getUserStatus(userId)` 先查缓存，miss 则调用内部 API `/api/v1/internal/user/status`，结果写入缓存。封禁/注销返回 false 时立即失效缓存 |

---

### 模块 E：统一用户中心页面

#### 功能 E1：主站用户中心

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-E1-S1 | 用户中心页面 — 个人信息 Tab | `src/app/account/page.tsx`（新建） | 无 | `/account` 路由（需要登录）。包含：昵称编辑、头像上传、手机号显示（脱敏）、会员等级/积分展示。`data-testid="account-profile"` 存在 |
| P2-E1-S2 | 用户中心页面 — 安全设置 Tab | `src/app/account/page.tsx` | P2-E1-S1 | 密码修改（旧密码 + 新密码 + 确认）、微信绑定/解绑。`data-testid="account-security"` 存在 |
| P2-E1-S3 | 用户中心页面 — 授权管理 Tab | `src/app/account/page.tsx` | P2-C1-S1 | 列出用户已授权的子项目列表（client name、授权时间、获取的 scopes）。每个子项目有 **撤销授权** 按钮，点击后撤销该 client 的所有 OAuthSession、通知 backchannel logout。`data-testid="account-authorizations"` 存在。撤销后该 client 的 session 表 revokedAt 不为 null |
| P2-E1-S4 | 用户中心页面 — 设备管理 Tab | `src/app/account/page.tsx` | 无 | 列出用户所有活跃 RefreshToken 设备（设备名、IP、登录时间、最后活跃时间）。支持 **强制下线**（撤销特定 RefreshToken） |
| P2-E1-S5 | 用户中心页面 — 登录历史 Tab | `src/app/account/page.tsx` | 无 | 读取 `LoginAttempt` 表，展示最近 20 条登录记录（时间、方式、IP、成功/失败）。`data-testid="account-login-history"` 存在 |

#### 功能 E2：子项目可嵌入用户中心

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-E2-S1 | 用户中心 iframe 嵌入支持 | `src/app/account/embed/page.tsx`（新建） | P2-E1-S1~S5 | `/account/embed` 精简版用户中心，适合 iframe 嵌入。去除导航头/尾，仅保留内容区。通过 `postMessage` 与父窗口通信：`{ type: "NIHPLOD_SSO_LOGOUT" }` 通知子站用户登出 |
| P2-E2-S2 | postMessage 通信协议文档 | `src/app/account/embed/README.md`（新建） | P2-E2-S1 | 文档列出所有 message 类型：`NIHPLOD_SSO_READY`（iframe 加载完成）、`NIHPLOD_SSO_LOGOUT`（用户在主站登出）、`NIHPLOD_SSO_REVOKE`（用户撤销授权）。子站监听这些消息执行相应操作 |

---

### 模块 F：安全机制跨项目扩展

#### 功能 F1：CSRF 适配 OAuth 场景

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-F1-S1 | OAuth /authorize 端点 CSRF 防护 | `src/app/api/oauth/authorize/route.ts` | P2-A2-S1 | 使用 `state` 参数防 CSRF（OAuth 2.0 标准）。生成 authorization code 前校验 `state` 参数存在且长度 ≥ 16。回调时原样回传。**无需** `__Host-csrf_token` Cookie 校验（跨域请求无法携带 Strict Cookie） |
| P2-F1-S2 | OAuth /token 端点认证方式 | `src/app/api/oauth/token/route.ts` | P3-A3-S1 | token 端点使用 `client_id` + `client_secret` (HTTP Basic Auth or POST body) 认证，替代 CSRF Cookie。**非浏览器直接调用**，不需要 CSRF 防护 |

#### 功能 F2：OAuth 端点专用限流

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-F2-S1 | OAuth 端点限流配置集中管理 | `src/lib/ratelimit.ts` | P2-A2-S6, P3-A3-S7, P2-A4-S2 | `RATE_LIMIT_PRESETS` 新增配置（已在前面步骤中分别添加）。确认配置不冲突。`grep "oauth-" src/lib/ratelimit.ts` 返回所有 OAuth 限流预设 |
| P2-F2-S2 | OAuth 端点限流 IP 来源 | 各 OAuth route.ts | P2-F2-S1 | 所有 OAuth 端点使用 `getClientIP(request)` 获取真实 IP（考虑 `X-Forwarded-For` 代理头）。`/token` 端点额外按 `client_id` 维度限流（防止单个 client 密钥泄露后滥用） |

#### 功能 F3：Token 黑名单子站同步

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-F3-S1 | 新增 Token Introspection 端点 | `src/app/api/oauth/introspect/route.ts`（新建） | P2-A1-S3 | POST `token=<access_token>&client_id=xxx&client_secret=xxx`。验证 token 有效性 + 检查黑名单（`isTokenBlacklisted`）。返回 `{ active: true/false, sub, scope, client_id, exp }`。token 被黑名单 → `active: false` |
| P2-F3-S2 | 子项目 SDK 调用 Introspection | `packages/sso-verify/src/introspect.ts` | P2-F3-S1 | `createTokenVerifier` 增加可选 `introspectionEndpoint` 参数。验证 JWT 签名后额外调用 introspection 确认 token 未被吊销。introspection 结果缓存 30 秒 |

#### 功能 F4：登录安全记录来源子项目

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P2-F4-S1 | LoginAttempt 增加 clientId 字段 | `prisma/schema.prisma` LoginAttempt 模型 | 无 | 新增 `clientId String?` 字段。`@@index([clientId, createdAt(sort: Desc)])`。migration 后现有数据的 clientId 为 null |
| P2-F4-S2 | recordLoginAttempt 增加 clientId 参数 | `src/lib/auth-security.ts` `recordLoginAttempt` 函数 | P2-F4-S1 | 增加可选参数 `clientId?: string`。OAuth /token 端点调用时传入 `client_id` |
| P2-F4-S3 | logAuthEvent 增加 clientId | `src/lib/auth-logger.ts` | P2-F4-S2 | `AuthLogContext` 增加 `clientId?: string`。auth-logger 中 `logAuthEvent` 传递 clientId 到日志 payload |

---

## Phase 3 — 平台化扩展

### 模块 G：子项目接入 SDK 与向导

#### 功能 G1：Node.js SDK npm 包

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-G1-S1 | SDK 核心类 OAuth2Client | `packages/sso-sdk/src/client.ts`（新建） | Phase 2 全部完成后 | 导出 `new OAuth2Client({ clientId, clientSecret, redirectUri, providerUrl })`。方法：`getAuthorizationUrl({ scope, state })` 返回完整 authorize URL、`handleCallback({ code, codeVerifier })` 返回 `{ accessToken, refreshToken, idToken, user }`、`refreshAccessToken(refreshToken)` 返回新 token 对、`getUserInfo(accessToken)` 返回用户信息、`logout(accessToken)` 调用 SLO 端点、`introspect(accessToken)` 验证 token 有效性 |
| P3-G1-S2 | SDK Token 自动刷新与存储 | `packages/sso-sdk/src/token-store.ts` | P3-G1-S1 | 内置 InMemoryTokenStore 和 FileTokenStore（可选）。Token 过期前 60 秒自动刷新。并发刷新互斥锁 |
| P3-G1-S3 | SDK 事件系统 | `packages/sso-sdk/src/events.ts` | P3-G1-S1 | EventEmitter 事件：`tokensRefreshed`、`tokenExpired`、`userLoggedOut`、`sessionRevoked`。子项目监听事件更新 UI |
| P3-G1-S4 | SDK 降级策略 | `packages/sso-sdk/src/degradation.ts` | P3-G1-S1 | 主站不可用时（连续 3 次请求失败），使用本地缓存的 `id_token` claims 维持用户基本信息展示（TTL 5 分钟）。`sdk.on('providerUnavailable', callback)` 通知子项目降级模式 |

#### 功能 G2：前端 SDK（JS/TS）

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-G2-S1 | React Hook `useSSO` | `packages/sso-react/src/useSSO.ts`（新建） | P3-G1-S1 | 导出 `useSSO(config)` hook，返回 `{ user, isLoggedIn, isLoading, login, logout }`。内部使用 `fetchWithAuth` 模式获取用户信息。User 类型：`{ sub, phone?, nickname?, avatar?, membershipLevel? }` |
| P3-G2-S2 | React 登录按钮组件 | `packages/sso-react/src/LoginButton.tsx` | P3-G2-S1 | `<LoginButton>` 组件，点击后跳转到主站 authorize URL。支持 `variant`（primary/secondary/outline）、`size`、`className` props。未登录显示按钮，已登录显示用户头像+昵称下拉 |
| P3-G2-S3 | React 用户中心弹窗组件 | `packages/sso-react/src/UserCenterModal.tsx` | P3-G2-S1 | `<UserCenterModal>` 组件，以 iframe 嵌入主站 `/account/embed`。通过 postMessage 监听登出/撤销授权事件 |

#### 功能 G3：接入向导页面

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-G3-S1 | 管理后台接入向导页面 | `src/app/admin/oauth-clients/wizard/page.tsx`（新建） | P2-A5-S1 | 分步向导：① 填写应用名称和回调 URL → ② 选择需要的数据权限（scopes 勾选）→ ③ 系统自动生成 clientId + clientSecret → ④ 展示接入代码片段（Node.js/React/通用 HTTP）→ ⑤ 提供在线测试按钮（模拟完整 SSO 流程） |
| P3-G3-S2 | 在线连接测试 API | `src/app/api/admin/oauth-clients/test/route.ts`（新建） | P3-G3-S1 | POST `{ clientId, clientSecret, redirectUri }`。自动完成：生成 state → 调用 /authorize → 获取 code → 调用 /token → 调用 /userinfo。返回每步结果和耗时。全部成功返回 `{ success: true, steps: [...] }` |

---

### 模块 H：全平台统一审计日志

#### 功能 H1：SSO 审计事件模型

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-H1-S1 | 新增 SsoAuditEvent Prisma 模型 | `prisma/schema.prisma` | 无 | 字段：event (string: authorize/token/introspect/logout/userinfo/backchannel_logout/consent/status_change)、userId、clientId、clientName、ip、userAgent、detail (Json)、success (boolean)、createdAt。索引 `@@index([userId, createdAt(sort: Desc)])`、`@@index([clientId, createdAt(sort: Desc)])`、`@@index([event, createdAt(sort: Desc)])` |
| P3-H1-S2 | SsoAuditEvent 写入函数 | `src/lib/sso-audit.ts`（新建） | P3-H1-S1 | 导出 `recordSsoEvent(event, context)`。异步写入，失败不阻塞主流程。context 自动从请求中提取 IP/UA |
| P3-H1-S3 | 集成 audit 写入到所有 OAuth 端点 | `src/app/api/oauth/authorize/route.ts`, token, userinfo, logout, introspect | P3-H1-S2 | 每个 OAuth 端点在关键路径调用 `recordSsoEvent`：authorize → `event: "authorize"`（记录 consent 决定）、token → `event: "token"`（记录 grant_type 和结果）、userinfo → `event: "userinfo"`、introspect → `event: "introspect"`、backchannel logout → `event: "backchannel_logout"` |

#### 功能 H2：审计日志查询

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-H2-S1 | 管理端审计日志 API | `src/app/api/admin/sso-audit/route.ts`（新建） | P3-H1-S3 | GET 支持 query：`userId`、`clientId`、`event`、`success`、`startDate`、`endDate`、`page`、`pageSize`。返回 `{ items, pagination }`。需要 `verifyAuth` |
| P3-H2-S2 | 管理后台审计日志页面 | `src/app/admin/sso-audit/page.tsx`（新建） | P3-H2-S1 | 表格展示审计事件，支持筛选器（按事件类型、子项目、用户、时间范围）。每行显示时间、事件、用户、子项目、IP、结果。点击展开 detail JSON |

#### 功能 H3：日志保留与归档

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-H3-S1 | 审计日志自动清理 cron 任务 | `src/lib/cron-tasks.ts` | P3-H1-S1 | 新增 cron 任务（每天凌晨 5 点）：删除 90 天前的 SsoAuditEvent 记录。`cleanupOldSsoAuditEvents` 函数。任务注册到 `tasks` 数组。日志量 < 10k 条/天 |
| P3-H3-S2 | LoginAttempt 清理 cron 集成 SsoAuditEvent | `src/lib/cron-tasks.ts` | P3-H3-S1 | `cleanupOldLoginAttempts` 和 `cleanupOldSsoAuditEvents` 合并到一个 cron 任务执行，减少数据库连接占用 |

---

### 模块 I：多租户架构预留扩展点

#### 功能 I1：数据模型预留

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-I1-S1 | OAuthClient 增加 tenantId 字段 | `prisma/schema.prisma` OAuthClient 模型 | 无 | 新增 `tenantId String?` 字段，nullable，默认 null。`@@index([tenantId])`。代码注释：`// 多租户预留：当前为 null 表示全局共享，未来可按租户隔离 Client 注册` |
| P3-I1-S2 | User 模型 tenantId 设计注释 | `prisma/schema.prisma` User 模型 | 无 | 在 User 模型上添加注释：`// 多租户预留：如需租户隔离，添加 tenantId String? 字段，并在所有查询中添加 WHERE tenantId = ? 条件` |
| P3-I1-S3 | SsoAuditEvent 增加 tenantId | `prisma/schema.prisma` SsoAuditEvent 模型 | P3-H1-S1 | 新增 `tenantId String?` 字段，`@@index([tenantId, createdAt(sort: Desc)])`。写入时从 OAuthClient 继承 tenantId |

#### 功能 I2：多租户限流隔离设计

| 编号 | 步骤 | 目标文件 | 依赖 | AC |
|------|------|----------|------|-----|
| P3-I2-S1 | 限流 key 增加 tenant 维度注释 | `src/lib/ratelimit.ts` | 无 | 在 `rateLimit` 函数注释中添加多租户设计说明：`// 多租户预留：限流 key 格式可为 {tenantId}:{type}:{identifier}，确保租户间限流隔离。当前 tenantId 为空字符串` |
| P3-I2-S2 | OAuth 端点限流 tenant 感知 | 各 OAuth route.ts | I2-S1 | 在 `/authorize` 和 `/token` 端点注释中标记：`// 多租户：限流 key 应为 {tenantId}:oauth-authorize:{ip}`。当前实现中使用 `""` 作为默认 tenantId |

---

## 清单末尾：计划完整性自检

### E2E 流程验证

| 编号 | 场景 | 验收命令/步骤 | 预期结果 |
|------|------|--------------|----------|
| E2E-1 | 用户从子项目登录完整流程 | ① 访问 `https://advisor.nihplod.cn/login` → ② 被 302 到 `https://nihplod.cn/api/oauth/authorize?client_id=advisor&redirect_uri=...&scope=openid+profile&state=abc&code_challenge=...&code_challenge_method=S256` → ③ 未登录被 302 到 `/login?return_to=...` → ④ 用户输入手机号+验证码登录 → ⑤ 登录成功被 302 回 `/api/oauth/authorize?...` → ⑥ 展示 consent 页 → ⑦ 用户点击"授权" → ⑧ 302 到 `https://advisor.nihplod.cn/callback?code=xxx&state=abc` → ⑨ advisor 后端 POST `/api/oauth/token` 用 code+code_verifier 换取 token → ⑩ advisor 前端调用 `/api/oauth/userinfo` 获取用户信息 → ⑪ 页面显示用户昵称和头像 | 步骤 ⑩ 返回 200 + 用户 JSON；步骤 ⑪ 用户信息正确 |
| E2E-2 | 子项目间免密登录 | ① 用户已在 advisor 子站登录（主站 Cookie 有效）→ ② 打开子项目 B 登录页 → ③ 被 302 到 `https://nihplod.cn/api/oauth/authorize?client_id=project-b&...` → ④ 主站检测到已有 `__Host-user_token` Cookie 有效 → ⑤ 直接跳转 consent 页（跳过登录）→ ⑥ 用户点击"授权"→ ⑦ 正常回跳到子项目 B | 步骤 ④ 不显示登录表单，直接显示 consent |
| E2E-3 | 单点登出 | ① 用户在主站登出 → ② curl advisor 后端验证持有的 access_token（调用 introspection）→ ③ 刷新 advisor 页面 → ④ 显示登录按钮 | 步骤 ② 返回 `{ active: false }`；步骤 ④ 用户信息消失 |
| E2E-4 | 管理员封禁实感 | ① 管理员在后台封禁用户 → ② curl advisor 后端 introspection 端点验证 token → ③ advisor 前端请求 userinfo → ④ 显示"账户已被封禁" | 步骤 ② 返回 `{ active: false }`；步骤 ③ 返回 403 `error: "account_disabled"` |

### 安全渗透检查点

| 编号 | 攻击场景 | 验证命令 | 预期结果 |
|------|----------|----------|----------|
| SEC-1 | 伪造 redirect_uri | `curl "https://nihplod.cn/api/oauth/authorize?client_id=advisor&redirect_uri=https://evil.com/callback&..."` | 400 `{"error":"invalid_request","error_description":"redirect_uri not allowed"}` |
| SEC-2 | 伪造 state 不匹配 | 子项目生成的 state 与服务端回传的 state 不同时，子项目拒绝处理 | 子项目端校验 state === 原始值，不匹配则终止流程 |
| SEC-3 | 重复使用授权码 | `curl -X POST /api/oauth/token -d "code=SAME_CODE&..."` 两次 | 第一次 200，第二次 400 `{"error":"invalid_grant","error_description":"Authorization code has been used"}` |
| SEC-4 | 过期授权码 | 创建 code 后等待 6 分钟，然后调用 /token | 400 `{"error":"invalid_grant","error_description":"Authorization code expired"}` |
| SEC-5 | 缺少 PKCE code_verifier | 创建 code 时带 `code_challenge`，但 /token 时不传 `code_verifier` | 400 `{"error":"invalid_grant","error_description":"Missing code_verifier"}` |
| SEC-6 | 错误的 PKCE code_verifier | /token 时传错误的 code_verifier | 400 `{"error":"invalid_grant","error_description":"Invalid code_verifier"}` |
| SEC-7 | 未注册 client_id | `curl "/api/oauth/authorize?client_id=unknown&..."` | 400 `{"error":"unauthorized_client","error_description":"Client not found"}` |
| SEC-8 | 无 client_secret 调用 /token | `curl -X POST /api/oauth/token -d "grant_type=authorization_code&code=xxx&client_id=advisor"` 不传 client_secret | 401 `{"error":"invalid_client"}` |

### 性能检查点

| 编号 | 指标 | 验证方法 | 阈值 |
|------|------|----------|------|
| PERF-1 | /api/oauth/token P99 延迟 | `ab -n 1000 -c 10 -p token.json -T application/json https://nihplod.cn/api/oauth/token` | < 200ms |
| PERF-2 | /api/oauth/jwks.json P99 延迟 | `ab -n 10000 -c 100 https://nihplod.cn/api/oauth/jwks.json` | < 50ms（含缓存命中） |
| PERF-3 | /api/oauth/userinfo P99 延迟 | `ab -n 1000 -c 20 -H "Authorization: Bearer <valid_token>" https://nihplod.cn/api/oauth/userinfo` | < 100ms |
| PERF-4 | /api/oauth/introspect P99 延迟 | `ab -n 1000 -c 20 -p introspect.json -T application/json https://nihplod.cn/api/oauth/introspect` | < 150ms |

---

## 清单末尾：审核要点总结

1. **OAuth 2.0 授权码模式所有端点已完整设计并附带 curl 验证命令**：/authorize（GET+POST）、/token、/userinfo、/introspect、/jwks.json 共 5 个端点，每个有明确的请求/响应格式和错误码
2. **PKCE (S256) 在 /authorize 和 /token 端点间形成完整闭环**：code_challenge 在 authorization 阶段存入，code_verifier 在 token 阶段校验，防授权码拦截攻击
3. **授权码一次性使用通过 Prisma updateMany + used=false 乐观锁保证**：原子化消费，防止并发重用
4. **redirect_uri 使用精确匹配（===）而非前缀匹配**：防止开放重定向攻击（如 `advisor.nihplod.cn.evil.com` 绕过）
5. **子项目 Token 本地验证依赖 JWKS 缓存策略，需关注密钥轮换时的缓存失效窗口**：当前 HS256 对称密钥，JWKS 静态暴露；未来升级 RS256 非对称时，缓存的公钥可能在密钥轮换后短暂失效（建议子项目 SDK 在验证失败时强制刷新 JWKS）
6. **Refresh Token 复用现有原子化轮换机制（atomicallyRotateRefreshToken）**：`revokedAt=null` 乐观锁 + 重用检测已在 `/api/auth/refresh` 中验证，OAuth /token 端点复用此逻辑
7. **单点登出 (SLO) 采用 Backchannel Logout + Frontchannel iframe 双轨制**：Backchannel 用于服务端通知，Frontchannel 用于浏览器端 Cookie 清理，覆盖两种登出场景
8. **Backchannel Logout Token 使用独立 JWT_LOGOUT_SECRET 签名**：防止跨类型 Token 滥用，与 access_token/id_token/refresh_token 密钥隔离
9. **敏感数据脱敏在 UserInfo 端点按 scope 裁剪**：`phone` scope 返回脱敏手机号 `138****1234`，`phone:full` scope 仅在用户显式 consent 后返回完整号码
10. **多租户预留通过 tenantId nullable 字段实现**：当前默认为 null（单租户），所有查询无需修改；未来启用时仅需添加 WHERE tenantId = ? 过滤条件，并确保限流 key 包含 tenantId 前缀
11. **管理后台 OAuth Client 管理仅 owner 角色可操作**：`withRole(["owner"])` 权限隔离，防止普通管理员注册恶意 Client
12. **SDK 降级策略确保子项目在主站不可用时仍可展示缓存用户信息**：5 分钟 TTL 的 id_token claims 缓存，避免主站故障导致所有子项目用户功能完全瘫痪
13. **审计日志覆盖所有 OAuth 关键事件**：authorize、token、introspect、userinfo、logout、backchannel_logout 共 6 类事件，支持按用户/子项目/事件类型/时间范围多维检索
14. **⚠️ 风险点：HS256 对称密钥在 JWKS 端点暴露为 "oct" 类型**：`k` 字段为 base64url 编码的共享密钥，任何获取 JWKS 的子项目都可签发 Token。建议 Phase 3 后期升级为 RS256 非对称密钥（JWKS 仅暴露公钥）
15. **⚠️ 风险点：现有 `src/middleware.ts` 中 `/api/oauth/` 路径不在 PUBLIC_API_PREFIXES 中**：需在 Phase 2 开始前添加 `/api/oauth/` 到白名单，否则 Middleware 的 Secure by Default 策略会拦截所有未认证的 OAuth 请求
