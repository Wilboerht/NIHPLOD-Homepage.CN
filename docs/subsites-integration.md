# 子站对接运行手册（BA / 测肤）

本文约定主站、BA（ba.nihplod.cn）和测肤子站（smart.nihplod.cn）之间的身份、权限、内部 API、PII 和部署顺序。

## 1. 身份与管理员

- 主站是管理员身份、密码、TOTP、权限的唯一来源。
- BA 不再提供管理员创建、改角色、重置密码、封禁、删除。
- BA 只保留 SSO 影子 `profiles`，用于审计、外键和操作人关联。
- 唯一例外是 break-glass 应急账号：
  - 只能通过 `npm run init:break-glass` 创建；
  - 默认 `BA_BREAK_GLASS_ENABLED=false`；
  - 登录强制 TOTP；
  - 日常管理员统一由主站创建并同步。
- BA 本地登录模式生产默认 `break-glass`；`all` 只允许开发/迁移期临时使用。
- 历史本地管理员：
  1. `npm run audit:local-admins`
  2. 映射到主站 SSO
  3. `npm run audit:local-admins -- --apply` 禁用非 break-glass 本地账号

## 2. 权限

主站 BA 权限：

- `ba:access` / `ba:admin`：进入 BA 工作台
- `ba:complaints:read|write|delete|sensitive:read`
- `ba:certificates:read|download|submit|issue|update|revoke|delete|sensitive:read`

规则：

- BA 证书操作必须带签名 `x-internal-actor`，capability 由主站有效权限生成。
- BA 举报删除在主站要求 `ba:complaints:delete` + TOTP step-up。
- BA 工作台直连删除仅 SUPER_ADMIN；普通管理员必须走主站带 step-up 的路径。
- `ba:admin` capability 自动包含举报读写/删除/敏感查看和 `ba.access`。
- 证书 preview：
  - PENDING / REJECTED：`ba:certificates:read`
  - ISSUED / UPCOMING / EXPIRED / REVOKED：`read + download`

## 3. 内部 API

统一使用 HMAC-SHA256、时间戳和 nonce：

```text
METHOD|path|canonicalQuery|timestamp|nonce|bodySha256
```

需要操作人的特权接口还必须带签名 `x-internal-actor`：

```text
ACTOR|timestamp|nonce|actorHeader
```

主要接口：

- 证书：`/api/internal/admin/certificates/*`
- 举报：`/api/internal/admin/complaints/*`
- 管理员退出：`/api/internal/admin/session/revoke`
- 账户合并：`/api/internal/user-data/merge`
- 产品同步：`/api/internal/admin/products/sync`

## 4. 管理员登出

主站管理员登出会 best-effort 调用：

- BA `/api/internal/admin/session/revoke`
- 测肤 `/api/internal/admin/session/revoke`

子站递增本地会话版本/写入 `sessionRevokedAt`，使子站后台会话立即失效。

## 5. 产品同步

主站默认使用 v2 分批协议：

```json
{
  "schemaVersion": 2,
  "syncId": "uuid",
  "generatedAt": "ISO",
  "batchIndex": 0,
  "batchCount": 3,
  "totalProducts": 500,
  "products": [],
  "options": {}
}
```

- 主站按约 1MB / 200 个产品切批。
- 测肤按 `syncId + batchIndex` 幂等暂存。
- 只有所有批次收齐后才执行一次 v1 合并逻辑和缺失产品停用。
- 任一批失败不会误停用产品。
- 回滚：主站设置 `ADVISOR_PRODUCT_SYNC_PROTOCOL=v1`，但仅适用于小目录。

## 6. PII

- 列表只展示脱敏手机号。
- 详情默认脱敏；敏感权限用户需点击“查看完整手机号/联系方式”，5 分钟自动隐藏。
- 证书 PNG/PDF、举报证据、完整联系方式查看写审计。
- `phoneMasked` 永远保持脱敏；完整手机号使用独立 `phone` 字段。

## 7. BA 证书高风险操作二次验证

以下 BA 工作台操作必须由主站完成一次 TOTP step-up：

- `ba.certificates.issue`（含新建直接核发，资源为 `new`）
- `ba.certificates.revoke`
- `ba.certificates.delete`

流程：

1. BA 页面请求 `/api/certificates`，无有效 grant 时返回 `428 STEP_UP_REQUIRED`。
2. 前端打开 BA `/api/admin/auth/step-up/start`，BA 创建一次性 state 并跳转主站 `/admin/sso/step-up`。
3. 主站要求已登录管理员输入 TOTP，签发 120 秒 RS256 ticket，通过表单 POST 到 BA callback。
4. BA 校验 ticket（audience、issuer、state、action、resource、admin、client、exp），一次性消费 state 后写入 HttpOnly grant Cookie，重定向完成页。
5. 完成页通知父窗口，前端重试原请求；BA 在 `/api/certificates` 消费 grant。

约束：

- ticket/grant 均一次性，绑定管理员、action、resource、state；ticket 不进入 URL。
- step-up 要求主站管理员 SSO 使用 RS256/JWKS；旧 HS256 兼容模式不支持 step-up。
- break-glass 本地账号保留登录 TOTP 例外，不参与逐操作 step-up。
- 上线灰度：BA `BA_STEP_UP_ENFORCEMENT=off` → `warn`（仅日志）→ `enforce`（428）。
- 未设置时默认 `off`；配置成无法识别的值按 `enforce` 处理（fail-closed）。
- 切到 `enforce` 前必须确认主站 `BA_ADMIN_STEP_UP_ENABLED=true` 且 TOTP/JWKS 可用。
- 回滚：将 `BA_STEP_UP_ENFORCEMENT` 设为 `off`；已签发的 grant 会自然过期。
- 迁移：`db/migrate-20261119-admin-step-up.sql`。

## 8. 部署顺序

1. 测肤：迁移、merge、产品同步 v2、session revoke、内网 `OFFICIAL_API_URL`。
2. BA：迁移 `admin_step_up_*`、签名 actor、capability、PII、session revoke、下线本地管理员 API/UI；先保持 step-up `off`。
3. 主站：capability 修复、preview/PII、举报 step-up、登出 fan-out、积分补发、产品同步 v2、BA 工作台入口、step-up ticket 接口。
4. BA 切 `warn` 观察，再切 `enforce`；最后清理历史本地管理员，观察一周后移除旧 body actor / v1 兼容。

## 9. 环境变量

主站：

```env
NEXT_PUBLIC_BA_URL=https://ba.nihplod.cn
ADVISOR_API_BASE=http://127.0.0.1:3002
BA_INTERNAL_API_BASE=http://127.0.0.1:3001
BA_ADMIN_STEP_UP_ENABLED=true
BA_ADMIN_STEP_UP_AUDIENCE=ba-admin-stepup
# 可选；默认由 BA_ADMIN_SSO_REDIRECT_URI 派生
# BA_ADMIN_STEP_UP_REDIRECT_URI=https://ba.nihplod.cn/api/admin/auth/step-up/callback
BA_STEP_UP_TICKET_TTL_SECONDS=120
```

BA：

```env
NEXT_PUBLIC_ADVISOR_URL=https://smart.nihplod.cn
NEXT_PUBLIC_MAIN_ADMIN_URL=https://nihplod.cn/admin
ADMIN_SSO_LOCAL_LOGIN_MODE=break-glass
ADMIN_STEP_UP_AUDIENCE=ba-admin-stepup
BA_STEP_UP_ENFORCEMENT=off
BA_STEP_UP_GRANT_TTL_SECONDS=120
# 可选；默认由 ADMIN_SSO_REDIRECT_URI 派生
# ADMIN_SSO_STEP_UP_REDIRECT_URI=https://ba.nihplod.cn/api/admin/auth/step-up/callback
```

测肤：

```env
NEXT_PUBLIC_MAIN_ADMIN_URL=https://nihplod.cn/admin
OFFICIAL_API_URL=http://127.0.0.1:3000
```
