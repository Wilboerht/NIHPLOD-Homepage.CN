# SSO 生产部署 Runbook

NIHPLOD 统一认证中心（nihplod.cn）生产部署操作手册。按本文档顺序执行即可完成一次完整的 SSO 上线或升级。

配套文档：[SSO 子项目接入指南](./sso-integration.md)。

## 目录

1. [数据库迁移](#1-数据库迁移)
2. [环境变量清单](#2-环境变量清单)
3. [上线后冒烟清单](#3-上线后冒烟清单)
4. [回滚步骤](#4-回滚步骤)
5. [监控与告警建议](#5-监控与告警建议)

---

## 1. 数据库迁移

### 1.1 正常流程

```bash
npx prisma migrate deploy
```

该命令按目录名顺序应用 `prisma/migrations/` 下所有未执行的迁移，生产环境**只使用此命令**，禁止使用 `prisma db push`。

### 1.2 特别注意：wechat_exchange_nonce_types 迁移重命名

`prisma/migrations/20260728000003_add_wechat_exchange_nonce_types` 是由旧目录 `_add_wechat_exchange_nonce_types` **重命名修复**而来（原目录以下划线开头导致排序错误，且 SQL 文件带 BOM，全新部署会失败；现已修复）。

该迁移内容为向 `TokenBlacklistType` 枚举新增 `wechat_exchange_token` 与 `internal_api_nonce` 两个值。

**判断是否需要处理**：如果生产库此前通过 `prisma db push` 或手工 SQL 已应用过该变更（即上述枚举值已存在），直接 `migrate deploy` 会报 "migration failed / enum value already exists"。此时先标记该迁移为已应用，再正常部署：

```bash
npx prisma migrate resolve --applied 20260728000003_add_wechat_exchange_nonce_types
npx prisma migrate deploy
```

如果生产库从未应用过（全新库或确定无此枚举值），跳过 `resolve`，直接 `migrate deploy` 即可。

可用以下 SQL 确认枚举值是否已存在：

```sql
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname = 'TokenBlacklistType';
-- 已存在 wechat_exchange_token / internal_api_nonce 时，需先 resolve --applied
```

### 1.3 本次新增迁移（向后兼容，可随 `migrate deploy` 直接应用）

| 迁移 | 内容 | 兼容性 |
| --- | --- | --- |
| `20260811161200_oauth_client_secret_rotation` | `OAuthClient` 表新增 `previousSecretHash`（TEXT，可空）与 `secretRotatedAt`（TIMESTAMP，可空），用于 Client 密钥轮换过渡期跨实例共享旧 secret hash | 纯增量加列，旧代码可继续读写该表 |
| `20260811161300_token_blacklist_dpop_jti` | `TokenBlacklistType` 枚举新增 `dpop_jti`，用于 DPoP proof jti 防重放记录 | 枚举新增值不影响存量数据 |
| `20260826000000_add_oauth_client_webhook_uri` | `OAuthClient` 表新增 `webhookUri`（TEXT，可空，用户资料变更 webhook 推送地址）；新增 `WebhookDeliveryFailure` 表（webhook 投递失败补偿队列） | 纯增量加列加表，旧代码可继续读写 |
| `20260903000000_spent_import` | 新增 `SpentImportBatch`（导入批次）与 `SpentImportRow`（逐行明细）表、`SpentImportRowStatus` 枚举，支撑管理端 Excel 批量导入消费记录及整批撤销审计 | 纯增量加表，旧代码可继续读写 |
| `20260903010000_membership_four_tiers` | 会员等级四档化（普通/银卡 ¥1,000/金卡 ¥5,000/钻石 ¥10,000），存量 ADVANCED 按累计消费拆档；积分体系重新上线（`PointLedger`/`PointBalance` 表、`PointLedgerType` 枚举，稳定期 7 天、6 个月过期）；User 新增各档激活日、生日锁定、生日积分年度幂等字段 | 枚举切换 + 加表加列；存量 ADVANCED <¥1,000 的用户归普通档，其余按消费额升档，无数据丢失 |
| `20260903020000_point_gifts` | 新增 `PointGift`（积分礼品目录）与 `PointRedemption`（兑换记录/履约状态）表、`PointRedemptionStatus` 枚举，支撑用户面板积分兑换与管理端履约 | 纯增量加表，旧代码可继续读写 |

六份迁移均为向后兼容的增量变更，**无需停机**，在应用滚动发布前执行即可。

### 1.4 迁移后验证

```bash
npx prisma migrate status
# 期望输出：Database schema is up to date!
```

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
| `JWT_ID_TOKEN_PRIVATE_KEY` / `JWT_ID_TOKEN_PUBLIC_KEY` | RS256 密钥对，生产必须配置。SDK 一律拒绝 HS256 签名的 id_token，未配置时子项目回调会全部失败 |
| `TOKEN_BLACKLIST_STORAGE` | 必须显式设为 `database`。多实例部署时 memory 模式各实例黑名单不互通，撤销无法即时生效 |
| `RATE_LIMIT_STORAGE` | 必须显式设置（生产多实例用 `database`），防止限流被多实例绕过 |
| `LOGIN_ATTEMPT_HMAC_KEY` | 必须配置且不少于 32 字符。LoginAttempt 表以 HMAC-SHA256 存储登录标识符，缺失时应用启动直接报错；生成方式同 2.1（`openssl rand -hex 32`） |

可使用 `npm run check:sso-config` 逐项核对本节全部强制项（输出 PASS/FAIL 清单，任一 FAIL 退出码为 1）。

### 2.3 推荐项：RS256 密钥对

推荐同时配置以下两套密钥对（与 `JWT_ID_TOKEN_*` 一起一次生成）：

- `JWT_ACCESS_PRIVATE_KEY` / `JWT_ACCESS_PUBLIC_KEY` — OAuth access_token RS256 签名，子项目可通过 `/api/oauth/jwks` 本地验签
- `JWT_LOGOUT_TOKEN_PRIVATE_KEY` / `JWT_LOGOUT_TOKEN_PUBLIC_KEY` — backchannel logout token 签名

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

### 2.6 迁移期临时开关

`ALLOW_HS256_FALLBACK=true` 允许 access_token / id_token 在 RS256 验证失败后回退 HS256 验签，**仅供新旧密钥体系迁移过渡期临时启用**。过渡期结束必须改回 `false`（生产默认值）。长期开启会让 HS256 secret 泄露可直接伪造 token。

### 2.7 SSRF 防护的已知边界（DNS rebinding）

主站对子项目注册的 `redirect_uri` / `backchannel_logout_uri` 做 SSRF 校验时，采用的是**字面主机名黑名单**（拦截 localhost、私网/保留 IP 段字面量），**不做 DNS 解析**。因此存在 DNS rebinding 绕过空间：攻击者可注册一个解析结果在公网与私网之间切换的域名，通过校验后在实际回调时解析到内网地址。

完整防护需在连接建立时校验实际解析结果，代价是每次回调都引入 DNS 查询，当前实现未覆盖。生产部署建议配合网络层防护兜底：为应用出口配置防火墙/代理规则，禁止主站 Pod（或实例）访问内网网段与云元数据地址（169.254.169.254 等）。

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

# 撤销
curl -i -X POST https://nihplod.cn/api/oauth/revoke \
  -d "token=<refresh_token>&client_id=<client_id>"

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

直接回滚到上一个版本镜像/构建产物并重启即可，**无需回退数据库**：

- `20260811161200_oauth_client_secret_rotation` 只新增了两个可空字段，旧代码读写 `OAuthClient` 不受影响；
- `20260811161300_token_blacklist_dpop_jti` 只是枚举新增值，对存量数据无害。

PostgreSQL 枚举值无法安全删除，因此**不要**尝试回退这两份迁移。

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
| Refresh token 重用检测 | 审计事件 `refresh_token_family_revoked` | 出现即告警（可能是 refresh token 泄露后的重放，整个 token family 已被强制撤销） |
| 授权码重放 | 审计事件 `code_replay_all_tokens_revoked` | 出现即告警（同一 code 二次使用，该 code 签发的所有 token 已被撤销） |
| Introspect 端点失败率 | `/api/oauth/introspect` 返回非 200 / `active: false` 占比 | 失败率突增告警（可能密钥配置错误或子站 token 大面积失效） |
| 登录失败激增 | 登录接口审计 / 日志中的失败记录 | 单位时间失败数超基线告警（可能撞库攻击） |
| 限流 429 激增 | 各 OAuth 端点 429 响应数 | 激增告警（可能暴力破解或异常客户端轮询；同时确认 `RATE_LIMIT_STORAGE=database` 已生效） |

### 5.2 审计事件查询入口

所有 SSO 审计事件（登录、授权、token 签发/刷新/撤销、backchannel logout 投递等）落库 `SsoAuditEvent` 表，可通过以下入口查询：

- **管理后台页面**：`/admin/sso-audit` — 按事件类型、用户、Client、时间范围筛选；
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
# 1. 迁移数据库（如适用先 resolve 历史迁移，见 1.2）
npx prisma migrate resolve --applied 20260728000003_add_wechat_exchange_nonce_types  # 仅生产库已手工应用过时
npx prisma migrate deploy
npx prisma migrate status

# 2. 核对环境变量（第 2 节全部强制项）

# 3. 发布应用并滚动重启

# 4. 执行冒烟清单（第 3 节）

# 5. 确认告警规则生效（第 5 节）
```
