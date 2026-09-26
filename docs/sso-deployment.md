# SSO 生产部署 Runbook

NIHPLOD 统一认证中心（nihplod.cn）生产部署操作手册。按本文档顺序执行即可完成一次完整的 SSO 上线或升级。

配套文档：[SSO 子项目接入指南](./sso-integration.md)。

## 目录

0. [历史凭证泄露应急轮换（优先执行）](#0-历史凭证泄露应急轮换优先执行)
1. [数据库迁移](#1-数据库迁移)
2. [环境变量清单](#2-环境变量清单)
3. [上线后冒烟清单](#3-上线后冒烟清单)
4. [回滚步骤](#4-回滚步骤)
5. [监控与告警建议](#5-监控与告警建议)

---

## 0. 历史凭证泄露应急轮换（优先执行）

仓库历史提交（`9d25b71d`、`c88bf598`、`53428f49`、`8ae9c479`）曾包含 `.env.production` 与 `.env.production.payment-template`（文件已删除，但内容仍在 git 历史中）。其中包含 `DATABASE_URL`、`JWT_SECRET`、`ADMIN_PASSWORD`、`WECOM_*`、`OPENAI/DEEPSEEK_API_KEY`、`NEXT_PUBLIC_AMAP_SECRET`、微信支付 API v3 key/商户私钥、支付宝配置等。凡曾克隆过仓库者均可读取，**必须按已泄露处理并全部轮换**：

1. **数据库密码**：在数据库控制台轮换 PostgreSQL 密码，更新部署环境中的 `DATABASE_URL`。
2. **应用密钥**（逐个重新生成 ≥32 字符强随机串，更新部署环境变量）：
   - `JWT_ADMIN_SECRET`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`JWT_WECHAT_BIND_SECRET`、`JWT_WECHAT_EXCHANGE_SECRET`、`JWT_ID_TOKEN_SECRET`、`JWT_LOGOUT_SECRET`
   - `LOGIN_ATTEMPT_HMAC_KEY`、`SMS_CODE_HMAC_KEY`
   - `INTERNAL_API_KEYS`（重新签发并同步所有子项目）
   - 影响：轮换 `JWT_*_SECRET` 会使存量令牌/会话失效（用户需重新登录），选择低峰期执行。
3. **RS256 密钥对**：若生产使用 RS256，用 `npx tsx scripts/generate-oauth-rs256-keys.ts` 重新生成
   `JWT_ACCESS_*` / `JWT_ID_TOKEN_*` 密钥对。轮换时把旧公钥写入 `JWT_OAUTH_*_PREV_PUBLIC_KEY`
   过渡一代，并相应调整 `JWT_OAUTH_*_KID`，待存量 token 过期后移除。
4. **第三方凭证**：阿里云 OSS/SMS AccessKey、高德 Key 与安全密钥、企业微信机器人 webhook 与应用
   secret、OpenAI/DeepSeek API Key、微信支付 API v3 key 与商户私钥、支付宝私钥——全部在各自控制台重置。
5. **管理员密码**：重置 `ADMIN_PASSWORD` 与后台全部管理员账号密码；`JWT_ADMIN_SECRET` 轮换或重启即
   使存量管理员会话失效。
6. **清理 git 历史**（需与所有克隆者协调，强制推送后旧克隆必须废弃）：
   ```bash
   git filter-repo --path .env.production --path .env.production.payment-template --invert-paths
   git push --force --all
   git push --force --tags
   ```
   随后检查 GitHub 仓库可见性，开启 secret scanning / push protection。
7. **防复发**：`.gitignore` 已含 `.env.*`；CI 增加 gitleaks 等密钥扫描；禁止把真实密钥写入仓库内任何
   文件（含文档、示例、脚本、测试 fixture）。

> 轮换完成前，不要把该仓库的任何副本分发到仓库外（打包、网盘、CI 缓存等）。

---

## 1. 数据库迁移

### 1.0 迁移历史已压缩为基线（0_init）— 先读这一节

历史上基线表由 `prisma db push` 创建，没有对应的 `CREATE TABLE` 迁移，导致全新数据库/灾备
库执行 `migrate deploy` 会在第一条迁移（`ALTER TABLE "LoginAttempt" ...`）就失败。现已把全部
历史迁移**压缩为单一基线**：

- `prisma/migrations/0_init/migration.sql`：当前 schema 的完整建库脚本（含全部表、枚举、索引，
  以及 schema 无法表达的三个部分唯一索引：`SmsCode_phone_type_used_false_key`、
  `SpentAdjustmentApplication_userId_orderNo_active_key`（按用户隔离，防跨用户订单号枚举/抢占）、
  `UserAddress_userId_default_key`（每用户最多一条默认地址））。
- `prisma/migrations/20260925000000_restore_oauth_unique_indexes/migration.sql`：恢复历史上被
  误删的 `OAuthAuthorizationCode_code_key` / `OAuthSession_sessionId_key` 唯一索引。
- `prisma/migrations/20260925000001_spent_order_unique_per_user/migration.sql`：把补录订单号的
  全局部分唯一索引替换为 `(userId, orderNo)` 部分唯一（存量库生效；全新库由 0_init 覆盖）。
- `prisma/migrations/20260925000002_user_address_single_default/migration.sql`：默认地址部分唯一
  索引（先对存量数据去重，只保留每用户最早的一条默认）。
- `prisma/migrations/20260925000003_refresh_token_revoked_reason/migration.sql`：`RefreshToken.revokedReason`
  可空列（区分"设备数超限淘汰/登出/改密/强制下线"等非泄漏撤销，避免正常重放被误判为 token 泄漏而反向吊销操作端）。
- `prisma/migrations/20260925000004_oauth_code_auth_time/migration.sql`：`OAuthAuthorizationCode.authTime`
  可空列（ID Token 的 `auth_time` claim，供 RP 校验 `max_age`）。

**两条路径，按环境选择：**

| 环境 | 操作 |
| --- | --- |
| **已有数据库（生产/预发）** | 先 `npx prisma migrate resolve --applied 0_init`（只标记基线已应用，**不执行建表**），再 `npx prisma migrate deploy`（执行 restore-unique-indexes / spent-order / address-default / revoked-reason / auth-time 五个增量迁移）。`_prisma_migrations` 中的旧迁移记录会被 `migrate deploy` 忽略，无需清理。 |
| **全新数据库（灾备/本地）** | 直接 `npx prisma migrate deploy`，按 `0_init` → 五个增量迁移顺序建库（增量迁移均为幂等空操作）。 |

> ⚠️ 已有库若跳过 `resolve --applied 0_init` 直接 `migrate deploy`，会因表已存在而报错（不会丢数据，
> 但部署中断）。执行 `resolve` 前请确认库中数据与当前 schema 一致（即此前已跑完旧迁移）。

### 1.1 正常流程

```bash
npx prisma migrate deploy
```

该命令按目录名顺序应用 `prisma/migrations/` 下所有未执行的迁移，生产环境**只使用此命令**，禁止使用 `prisma db push`。

### 1.2 迁移后验证

```bash
npx prisma migrate status
# 期望输出：Database schema is up to date!
```

建议额外确认唯一索引已恢复（应返回 2 行）：

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('OAuthAuthorizationCode_code_key', 'OAuthSession_sessionId_key');
```

### 1.3 历史迁移引用（已压缩，仅排障参考）

- 旧迁移目录已删除（内容在 git 历史中可查）。此前文档提到的
  `20260728000003_add_wechat_exchange_nonce_types` 人工 `resolve` 处理方式**不再需要**。
- 迁移恢复：如需在本地临时复现旧迁移，可从 git 历史检出对应目录，但不要与压缩后的基线混用。

---

## 2. 环境变量清单

与 `.env.example` 对齐。生产部署前逐项核对。

### 2.1 强制项：7 个 JWT Secret

以下 7 个密钥**必须全部配置**，每个不少于 32 字符的强随机串，缺失时应用启动直接报错：

- `JWT_ADMIN_SECRET`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_WECHAT_BIND_SECRET`
- `JWT_WECHAT_EXCHANGE_SECRET`
- `JWT_ID_TOKEN_SECRET`
- `JWT_LOGOUT_SECRET`

生成命令：

```bash
# Linux / macOS
openssl rand -hex 32

# Windows PowerShell
[System.Convert]::ToBase64String((New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes(32))
```

⚠️ 严禁使用 `dev-*-secret-` 等可预测模式；有子站时各站 JWT 密钥必须全站一致才能单点登录。

### 2.2 生产环境强制项

| 变量 | 要求 |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | 必须为正式域名（如 `https://nihplod.cn`），**不允许 localhost**，OAuth 回调地址拼接依赖它 |
| `JWT_ID_TOKEN_PRIVATE_KEY` / `JWT_ID_TOKEN_PUBLIC_KEY` | RS256 密钥对，生产**必须**配置。SDK 一律拒绝 HS256 签名的 id_token，未配置时子项目回调会全部失败 |
| `JWT_ACCESS_PRIVATE_KEY` / `JWT_ACCESS_PUBLIC_KEY` | RS256 密钥对，生产**必须**配置（`src/lib/jwt.ts` / `server-init.ts` 启动强校验）；否则启动直接报错，除非显式设置 `ALLOW_HS256_FALLBACK=true`（不推荐） |
| `TOKEN_BLACKLIST_STORAGE` | 必须显式设为 `database`。多实例部署时 memory 模式各实例黑名单不互通，撤销无法即时生效 |
| `RATE_LIMIT_STORAGE` | 必须显式设置（生产多实例用 `database`），防止限流被多实例绕过 |
| `LOGIN_ATTEMPT_HMAC_KEY` | 必须配置且不少于 32 字符。LoginAttempt 表以 HMAC-SHA256 存储登录标识符，缺失时应用启动直接报错；生成方式同 2.1（`openssl rand -hex 32`） |
| `SMS_CODE_HMAC_KEY` | 必须配置且不少于 32 字符（`src/lib/server-init.ts` 启动强校验），用于验证码 HMAC |
| `TRUST_PROXY` / `TRUST_PROXY_HOPS` | 生产必须 `TRUST_PROXY=true`，并按实际反向代理层数配置 `TRUST_PROXY_HOPS`（取 XFF 从右往左第 N 个条目；缺失时运行时抛错、IP 限流失效） |
| `ALI_OSS_PRIVATE_BUCKET` | 消费补录凭证（含个人信息）的生产存储；未配置时生产环境上传 fail-closed（503）。仅本地开发或显式 `ALLOW_PUBLIC_SPENT_PROOF_STORAGE=true` 才回退公开存储 |

可使用 `npm run check:sso-config` 逐项核对本节全部强制项（输出 PASS/FAIL 清单，任一 FAIL 退出码为 1）。

### 2.3 其余推荐项：Logout Token 密钥对

推荐配置（与 `JWT_ID_TOKEN_*` 一起一次生成）：

- `JWT_LOGOUT_TOKEN_PRIVATE_KEY` / `JWT_LOGOUT_TOKEN_PUBLIC_KEY` — backchannel logout / profile 事件 token 签名

生成命令（输出即为单行 `.env` 格式，PEM 换行已转义为字面 `\n`，直接复制即可）：

```bash
npx tsx scripts/generate-oauth-rs256-keys.ts
```

⚠️ `*_PRIVATE_KEY` 是最高机密，严禁提交 Git、发到聊天工具或写入日志；请通过密钥管理系统分发，用完清除终端滚动缓冲。

### 2.4 密钥轮换流程

JWKS 端点支持同时暴露当前与上一代公钥，实现无感轮换：

1. 生成新密钥对（同上命令）；
2. 先将**旧公钥**配置到 `*_PREV_PUBLIC_KEY`，并确认 `*_KID` / `*_PREV_KID` 设置正确，发布上线；
   - 对应变量：`JWT_OAUTH_ACCESS_PREV_PUBLIC_KEY`、`JWT_OAUTH_ID_TOKEN_PREV_PUBLIC_KEY`、`JWT_LOGOUT_TOKEN_PREV_PUBLIC_KEY`
   - kid 默认值：当前 `access-token-rs256-v1` / `id-token-rs256-v1` / `logout-token-rs256-v1`，上一代默认 `-v0`
3. 再将新密钥对配置为当前密钥（`*_PRIVATE_KEY` / `*_PUBLIC_KEY`），发布上线。过渡期内验证侧按 kid 匹配，旧 token 仍可验签；
4. 待旧密钥签发的 token 全部过期后，移除 `*_PREV_*` 配置。access token 有效期默认为 15 分钟（按 Client 可通过 `accessTokenTtlSeconds` 配置，范围 60–86400 秒），id_token 固定为 1 小时（`src/lib/jwt.ts` 硬编码），按实际配置的最大值等待即可。

### 2.5 Embed 嵌入配置

- `EMBED_ALLOWED_ORIGINS`（服务端，CSP `frame-ancestors`）与 `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS`（客户端 postMessage targetOrigin 白名单）**两个值必须完全一致**，均为逗号分隔的完整 origin，例如：

```bash
EMBED_ALLOWED_ORIGINS=https://advisor.nihplod.cn,https://mall.nihplod.cn
NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS=https://advisor.nihplod.cn,https://mall.nihplod.cn
```

- 不启用 `/account/embed` 嵌入时**两个都不配置**，此时 `frame-ancestors` 默认仅 `'self'`（仅允许同源嵌入）。
- ⚠️ `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS` 在**构建期内联**进前端 bundle：修改后必须重新执行 `npm run build` 并重新发布，仅重启进程不会生效（服务端 `EMBED_ALLOWED_ORIGINS` 为运行时读取，重启即可生效）。
- `/account/embed`、`/privacy/embed`、`/terms/embed` 的 `X-Frame-Options` 已在 `next.config.mjs` 中置空（由 CSP `frame-ancestors` 白名单控制），现代浏览器以 CSP 为准。

### 2.6 迁移期临时开关

`ALLOW_HS256_FALLBACK=true` 允许 access_token / id_token 在 RS256 验证失败后回退 HS256 验签，**仅供新旧密钥体系迁移过渡期临时启用**。过渡期结束必须改回 `false`（生产默认值）。长期开启会让 HS256 secret 泄露可直接伪造 token。

### 2.7 SSRF 防护的已知边界（DNS rebinding）

主站对子项目注册的 `redirect_uri` / `backchannel_logout_uri` 做 SSRF 校验时，采用的是**字面主机名黑名单**（拦截 localhost、私网/保留 IP 段字面量），**不做 DNS 解析**。因此存在 DNS rebinding 绕过空间：攻击者可注册一个解析结果在公网与私网之间切换的域名，通过校验后在实际回调时解析到内网地址。

完整防护需在连接建立时校验实际解析结果，代价是每次回调都引入 DNS 查询，当前实现未覆盖。生产部署建议配合网络层防护兜底：为应用出口配置防火墙/代理规则，禁止主站 Pod（或实例）访问内网网段与云元数据地址（169.254.169.254 等）。

### 2.8 定时任务（本地 cron / 外部调度器）

清理类任务（过期 Refresh Token / Token 黑名单 / 限流记录 / 验证码 / 授权码 / 审计日志等）与重投类任务（Backchannel Logout、资料变更 Webhook）有两种运行模式，**二选一**：

1. **进程内 cron（默认）**：`ENABLE_LOCAL_CRON=true`，由 node-cron 在应用进程内按周期执行。
   ⚠️ **多实例部署时仅允许一个实例设 `ENABLE_LOCAL_CRON=true`**——当前没有领导者选举，多实例同时开启会让重投类任务被重复投递、清理类任务重复执行。
2. **外部调度器**：`ENABLE_LOCAL_CRON=false`，配置 `CRON_SECRET`（≥32 字符强随机串），由 K8s CronJob / 系统 crond 等周期性调用：

```bash
curl -X POST "https://nihplod.cn/api/cron/run" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

`POST /api/cron/run` 依次触发全部清理类任务（运行记录落库 `CronTaskRun`，`trigger=external`，可在管理端「定时任务」页面查看）；请求体传 `{"taskName": "<任务名>"}` 可单独触发指定任务。建议调度频率不低于每小时一次（过期 nonce / Token 黑名单记录按小时清理）。

补充：失败队列（Backchannel / 资料 Webhook）支持管理端手动重投，重投采用**原子认领**（先删除记录再投递，失败按退避重建），与 cron 重投并发时不会重复投递；失败队列接口不回传 `payload`（含用户资料快照 PII）。进程内 cron 任务失败会写 `CronTaskRun`（`success=false`）并输出错误日志，外部调度器端点整体失败时返回 500（便于调度平台告警）。

`POST /api/cron/run` 使用数据库事务级 advisory lock 做**跨实例互斥**：已有调度在执行时返回 409 `ALREADY_RUNNING`（调度器可按普通失败重试，不会并发执行大批 `deleteMany`）；整次调度超时（默认 280s）时事务回滚并自动释放锁，返回 500 `CRON_RUN_FAILED`。审计日志（`AuditLog`）保留期由 `AUDIT_LOG_RETENTION_DAYS` 控制（默认 365 天，允许 30–3650），由每日任务「Cleanup Old Audit Logs」物理删除到期记录。

### 2.9 凭证变更与会话撤销口径

以下操作会触发服务端集中撤销（`src/lib/session-revocation.ts`，对失败不阻断主流程）：

| 操作 | 内部 refresh token（保留当前设备） | OAuth 作用域 refresh token | OAuthSession + backchannel |
| --- | --- | --- | --- |
| 修改密码（`/api/user/password`） | 撤销其余设备，保留当前 Cookie 设备 | 全部撤销 | 全部撤销并通知子站 |
| 首次设密（`/api/user/password/set`） | 全部撤销（无当前 refresh token 时） | 全部撤销 | 全部撤销并通知子站 |
| 重置密码（`/api/auth/reset-password`） | 全部撤销 | 全部撤销 | 全部撤销并通知子站 |
| 换绑手机号（`/api/user/phone`） | 撤销其余设备，保留当前设备 | 全部撤销 | 全部撤销并通知子站 |

管理员安全约定：**只有 `owner` 角色可修改其他管理员的密码/邮箱，且 owner 不可删除自己或最后一个 owner**（`src/lib/admin-safety.ts`，含数据库 advisory lock 防并发绕过）；管理员登录 TOTP 与资金类操作 TOTP 均按一次性使用处理（同码在有效窗口内跨实例重放会被拒绝）。

---

## 3. 上线后冒烟清单

按顺序逐项执行，全部通过才算上线完成。

### 3.1 授权码全流程

1. 浏览器访问子站，触发跳转 `https://nihplod.cn/api/oauth/authorize?...`；
2. 完成登录（账号密码 / 短信 / 微信任一方式）；
3. 出现 consent 授权页（`/login?mode=consent&...`），确认授权；
4. 302 回到 `redirect_uri?code=xxx`，子站用 code + PKCE 调 `POST /api/oauth/token` 换得 `access_token` + `refresh_token` + `id_token`；
5. 带 access_token 调 `GET /api/oauth/userinfo` 返回用户信息；
6. 调 `POST /api/oauth/token`（`grant_type=refresh_token`）能换到新 token；
7. 调 `POST /api/oauth/revoke` 撤销后，再调 userinfo 应立即返回 **401**。

命令行快速验证（替换实际值）：

```bash
# userinfo 应返回用户 JSON
curl -i -H "Authorization: Bearer <access_token>" https://nihplod.cn/api/oauth/userinfo

# 撤销（Confidential Client 必须提供 client_secret；Public Client 可省略）
curl -i -X POST https://nihplod.cn/api/oauth/revoke \
  -d "token=<refresh_token>&client_id=<client_id>&client_secret=<client_secret>"

# 撤销后 userinfo 应立即 401
curl -i -H "Authorization: Bearer <access_token>" https://nihplod.cn/api/oauth/userinfo
```

### 3.2 弹窗登录（popup 模式）

通过 SDK 弹窗方式登录，授权成功后回调 URL 中原样回显 `popup_nonce` 参数（服务端仅透传不入库），SDK 侧比对一致才接受 token。验证要点：弹窗完成登录后父窗口收到回调且 nonce 匹配，篡改 nonce 的回调被拒绝。

### 3.3 Embed 嵌入（如已启用）

父页面 iframe 嵌入 `https://nihplod.cn/account/embed`：

1. iframe 加载完成后父窗口收到 `NIHPLOD_SSO_READY` 消息；
2. 用户在主站登出，父窗口收到 `NIHPLOD_SSO_LOGOUT`；
3. 用户撤销授权，父窗口收到 `NIHPLOD_SSO_REVOKE`（含 `clientId`）；
4. 非白名单 origin 的父页面无法嵌入（CSP 拦截）且不收到消息。

CSP `frame-ancestors` 响应头检查：

```bash
curl -sI https://nihplod.cn/account/embed | grep -i content-security-policy
# 期望 frame-ancestors 包含 'self' 及 EMBED_ALLOWED_ORIGINS 中的全部 origin
```

未启用 embed 时，期望输出仅 `frame-ancestors 'self'`。

### 3.4 撤销即时性

在管理后台撤销某用户的授权（或用户在账号设置中撤销）后，**立即**用该用户的 access_token 调 userinfo，应返回 401（sid 会话校验 fail-closed，撤销即失效）。若延迟超过数秒，检查 `TOKEN_BLACKLIST_STORAGE` 是否为 `database`、多实例是否共用同一数据库。

### 3.5 Backchannel Logout 投递

1. 子站 Client 在管理后台配置 `backchannel_logout_uri`；
2. 用户在主站登出或撤销授权；
3. 子站应收到 `POST` 请求，body 为 `logout_token=<JWT>`（form 编码）；
4. 用 JWKS 公钥验签 logout token，`events` 含 `http://schemas.openid.net/event/backchannel-logout`；
5. 主站日志无 `[SLO] Backchannel logout 通知失败` 告警（服务端会对失败投递重试一次，间隔 2 秒，单次请求超时 5 秒）。

---

## 4. 回滚步骤

### 4.1 代码回滚

直接回滚到上一个版本镜像/构建产物并重启即可，**无需回退数据库**（基线后均为可空新增列/幂等索引）：

- `20260925000000_restore_oauth_unique_indexes` / `20260925000001_spent_order_unique_per_user` /
  `20260925000002_user_address_single_default`：仅恢复/替换索引，旧代码读取不受影响；
- `20260925000003_refresh_token_revoked_reason` / `20260925000004_oauth_code_auth_time`：
  仅新增可空列，旧代码忽略未知列；
- 更早的 `20260811161200_oauth_client_secret_rotation`、`20260811161300_token_blacklist_dpop_jti`
  已被压缩进 `0_init` 基线（目录已删除），其字段/枚举值仍存在于基线中。

PostgreSQL 枚举值无法安全删除，因此**不要**尝试手工回退枚举相关变更。

### 4.2 sid 会话机制的向后兼容

新签发的 token 携带 `sid` claim 关联 `OAuthSession`，撤销后即时失效。上线前签发的旧 token **没有 sid**，验证时会跳过 sid 校验，按其原有过期时间自然过期（access token 默认 15 分钟，按 Client 的 `accessTokenTtlSeconds` 配置，上限 86400 秒；id_token 固定 1 小时），不会因为上线新机制而被强制失效，也不会绕过撤销检查以外的任何校验。回滚代码后，带 sid 的 token 由旧代码忽略 sid 字段，同样按原逻辑验证，无兼容问题。

### 4.3 配置回滚

- 若回滚后仍需 RS256 验签兼容，确认 `ALLOW_HS256_FALLBACK` 与 `*_PREV_PUBLIC_KEY` 配置与回滚版本的代码匹配；
- 环境变量本身不做版本管理，变更前在密钥管理系统保留上一代值，回滚时恢复即可。

---

## 5. 监控与告警建议

### 5.1 应告警的 SSO 信号

| 信号 | 日志 / 审计事件关键字 | 告警建议 |
| --- | --- | --- |
| Backchannel logout 投递失败 | 日志 `[SLO] Backchannel logout 通知失败`；审计事件 `backchannel_logout` 且 `success: false` | 单次失败可观察，同一 clientId 连续失败告警（子站登出状态将不一致） |
| 资料变更 webhook 投递失败 | 审计事件 `profile_webhook` 且 `success: false`（失败会落 `WebhookDeliveryFailure` 补偿队列，cron 每 15 分钟重投，超 10 次丢弃） | 同一 clientId 连续失败告警（子站用户资料缓存将长期不一致） |
| Refresh token 重用检测 | 审计事件 `status_change` 且 `detail.action = "refresh_token_family_revoked"`（落库字段：`event="status_change"`，`detail` 内含 `action` / `reason` / `familyRevokedCount`） | 出现即告警（可能是 refresh token 泄露后的重放，整个 token family 已被强制撤销） |
| 授权码重放 | 审计事件 `token` 且 `success: false`、`detail.reason = "code_replay_all_tokens_revoked"`（良性并发重试记为 `code_replay_benign_retry`，可不告警） | 出现即告警（同一 code 二次使用，该 code 签发的所有 token 已被撤销） |
| Introspect 端点失败率 | `/api/oauth/introspect` 返回非 200 / `active: false` 占比 | 失败率突增告警（可能密钥配置错误或子站 token 大面积失效） |
| 登录失败激增 | 登录接口审计 / 日志中的失败记录 | 单位时间失败数超基线告警（可能撞库攻击） |
| 限流 429 激增 | 各 OAuth 端点 429 响应数 | 激增告警（可能暴力破解或异常客户端轮询；同时确认 `RATE_LIMIT_STORAGE=database` 已生效） |

### 5.2 审计事件查询入口

所有 SSO 审计事件（登录、授权、token 签发/刷新/撤销、backchannel logout 投递等）落库 `SsoAuditEvent` 表，可通过以下入口查询：

- **管理后台页面**：`/admin/oauth/audit`（旧路径 `/admin/sso-audit` 会 301 重定向）— 按事件类型、用户、Client、时间范围筛选；
- **API**：`GET /api/admin/oauth/audit` — JSON 查询；追加 `?export=csv` 参数导出 CSV（字段：`id,event,userId,clientId,clientName,ip,success,createdAt`）。

```bash
# 导出 CSV 示例（需管理员鉴权 Cookie / Token）
curl -b "<admin_cookie>" \
  "https://nihplod.cn/api/admin/oauth/audit?export=csv" -o sso-audit.csv
```

建议将日志采集（应用 stdout）与审计表查询结合：实时告警走日志关键字，事后取证走审计事件导出。

---

## 附：部署顺序速查

```bash
# 1. 迁移数据库
#    已有库（含生产）：首次升级需先把压缩基线标记为已应用（见 1.0），仅一次
npx prisma migrate resolve --applied 0_init   # 仅既有库需要；全新库跳过
npx prisma migrate deploy
npx prisma migrate status

# 2. 核对环境变量（第 2 节全部强制项）

# 3. 发布应用并滚动重启

# 4. 执行冒烟清单（第 3 节）

# 5. 确认告警规则生效（第 5 节）
```
