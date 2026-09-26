# 账号自助注销方案（设计稿，未实现）

> 状态：方案评审用，尚未开发。本文件描述目标流程、数据处置口径与实现拆分，供产品/法务/研发确认后再进入排期。

## 1. 背景与目标

- 当前账号注销仅支持邮件人工（《用户协议》9.2：发送邮件至 service@nihplod.cn）。
- 目标：在用户中心提供**自助注销**入口，满足《个人信息保护法》"删除权"与合规审计要求，同时防止误操作与恶意注销。
- 非目标：不做"一键秒删"。注销涉及订单、发票、积分债务、子站授权与法定留存，必须有冷静期与可撤销窗口。

## 2. 合规与业务约束（需法务确认）

| 数据类型 | 处置建议 | 依据/说明 |
| --- | --- | --- |
| 手机号、昵称、头像、生日、性别 | 注销生效后删除或不可逆匿名化 | 个人信息主体删除权 |
| 登录/操作审计、订单、支付、发票 | 保留（仅保留必要字段，账户标识以匿名 ID 替代） | 电商法/税务留存义务（通常 ≥3 年） |
| 积分、优惠、兑换记录 | 随账号注销作废；存在未履约权益需在注销前提示 | 避免注销后争议 |
| 第三方身份（微信/抖音 openid、unionid） | 解绑并删除 ExternalIdentity；清理 User 旧列 | 防止注销后仍可被第三方回调定位 |
| 子站 OAuth 授权与 OAuthSession | 全部撤销并向已登记 backchannelLogoutUri 的 client 推送登出 | 复用 `revokeOtherSessionsAfterCredentialChange`/`sendBackchannelLogout` |
| Refresh/access token | 全部撤销并清除 Cookie | 会话立即失效 |

## 3. 用户流程

```
用户中心 → 安全中心 → 账号注销
  → 1. 风险与后果说明（保留数据清单、不可恢复提示）
  → 2. 身份验证（密码或短信验证码；占位手机号账号走微信授权验证）
  → 3. 二次确认（输入"注销账号"或勾选确认项）
  → 4. 提交申请 → 账号进入「注销冷静期」（建议 7 天）
       - 期间登录任意设备会显著提示"注销处理中"，并提供"撤销注销申请"
       - 期间可正常撤回；撤回不保留任何标记
  → 5. 冷静期结束 → 定时任务执行注销（不可逆）
  → 6. 完成后：发送回执短信；手机号释放（脱敏后可用于新注册，需法务确认释放策略）
```

## 4. 安全设计

- **防误操作**：冷静期 + 二次确认 + 身份验证三件套；冷静期内不限制登录，但每次登录显著提示撤回入口。
- **防恶意注销**：注销接口要求已登录 + CSRF + 频控（如 3 次/天）；被他人短暂控制会话时，撤回提示与改密通知可作为告警。
- **防止绕过撤销**：执行注销时在同一事务内撤销全部 refresh token/OAuthSession，并清除 `wechatOpenId`/`unionid` 等回退列，避免第三方回调重新激活。
- **不可逆点明确**：执行阶段不提供恢复；冷静期到期前 24 小时短信提醒。
- **审计**：申请/撤回/执行均写 `AuditLog` + `logAuthEvent`，标识使用 user id，不落明文手机号。

## 5. 数据模型（建议）

```prisma
model AccountDeletionRequest {
  id           String   @id @default(cuid())
  userId       String   @unique          // 同一用户仅一条进行中的申请
  status       String   @default("PENDING") // PENDING | CANCELLED | COMPLETED | FAILED
  reason       String?                   // 用户选填
  requestedAt  DateTime @default(now())
  scheduledAt  DateTime                  // 冷静期结束时间（执行窗口）
  cancelledAt  DateTime?
  completedAt  DateTime?
  attempts     Int      @default(0)      // 执行失败重试次数
  lastError    String?
  @@index([status, scheduledAt])
}
```

- 冷静期通过环境变量 `ACCOUNT_DELETION_COOLING_DAYS`（默认 7）配置，便于灰度期缩短。
- 执行任务接入现有 `cron-tasks.ts`（新增 `account-deletion-execute`），失败写 `CronTaskRun` 并保留 `FAILED` 申请待人工介入。

## 6. 接口草案

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/user/account/deletion` | 查询当前申请状态（含 scheduledAt、撤回入口） |
| POST | `/api/user/account/deletion` | 提交申请（需短信/密码验证 + CSRF；幂等：重复提交返回既有申请） |
| DELETE | `/api/user/account/deletion` | 撤回申请（仅 PENDING 可撤回） |
| — | cron `account-deletion-execute` | 扫描到期申请并执行注销 |

## 7. 注销执行步骤（事务/编排）

1. 复核状态：用户 `ACTIVE` 且申请仍为 `PENDING`（防撤回竞态，使用条件更新 `updateMany where status=PENDING` 抢占）。
2. 撤销全部会话：内部 refresh token 全撤 + OAuth refresh token 全撤 + OAuthSession 全撤 + backchannel logout。
3. 解绑第三方身份：删除 `ExternalIdentity`、清空 `wechatOpenId`/`wechatUnionId`/`openId` 类列。
4. 匿名化用户主体：`phone` 改为 `deleted_<hash>` 占位并释放原号码、清空昵称/头像/生日/性别/密码（密码置 null）、`status` 置 `DELETED`（需新增枚举值）。
5. 保留必要记录：订单、支付、积分流水、审计保留，关联关系不断（仍指向同一条 User 行，仅匿名化）。
6. 清理衍生数据：登录设备、验证码、限流记录、购物车/临时申请、授权同意记录的 PII 等按保留策略处理。
7. 标记 `COMPLETED`、发回执短信（使用注销前留存的号码），必要时写导出归档。

> 建议尽量使用"同一 User 行匿名化"而不是物理删除：避免历史订单外键断裂与统计口径跳变；物理删除仅适用于无任何交易记录的空账号。

## 8. 前端交互要点

- 入口：用户中心 → 安全中心 → 新增"账号注销"区块（或独立页）。
- 冷静期横幅：`AuthContext` 登录成功后如存在 PENDING 申请，全局顶部展示"注销处理中，X 天后生效 · 撤回"。
- 文案需明确列出：将删除的数据、将保留的数据（依法留存）、子站将退出登录、未使用权益作废。
- 移动端与 PC 复用同一组件，复用现有 `SecurityPanel` 的密码/验证码校验逻辑。

## 9. 测试与验收

- 单测：申请幂等、冷静期计算、撤回、执行抢占（并发只会执行一次）、匿名化字段、旧列清理、第三方身份删除、backchannel 推送、失败重试与 FAILED 状态。
- 集成：PG 容器（Docker）跑迁移 + 执行任务真实 SQL。
- 验收：注销后原手机号可重新注册；历史订单可查但无可识别个人信息；所有子站会话被登出；审计完整。

## 10. 排期建议（拆分）

1. 数据模型 + 迁移 + 申请/撤回接口（0.5 天）
2. 执行任务（匿名化 + 撤销 + 解绑 + 审计）（1 天）
3. 前端入口/冷静期横幅/撤回（0.5 天）
4. 单测与演练 + 法务文案评审（0.5 天）

待确认项：冷静期时长、手机号释放策略、保留年限、是否需要数据导出、空账号物理删除的口径。
