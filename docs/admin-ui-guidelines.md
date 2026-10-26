# 管理端 UI 规范

## Modal

- 统一使用 `src/components/ui/Modal.tsx`，禁止页面自建 Portal。
- 所有弹窗必须有 `title`（无标题时提供 `ariaLabel`）。
- 操作按钮放在 `footer`，移动端固定在滚动区外并包含安全区。
- 长表单/批量导入使用 `mobileFullScreen`，手机端全屏显示。
- 需要确认关闭的表单传 `closeGuard`，保存中禁止关闭。
- 一次性密钥/密码：禁止遮罩、Esc、X 关闭，必须显式确认已保存。
- 嵌套弹窗由 Modal 统一处理：下层 `inert + aria-hidden`，仅顶层 `aria-modal`。

## 表单

- 使用共享 `Input` / `Select` / `Textarea` / `DatePicker`，通过 `label`、`hint`、`error` 渲染辅助信息。
- 分区使用 `FormSection`，底部操作使用 `FormActions`。
- `<form>` 加 `noValidate`，由 Zod 校验；校验失败调用 `focusFirstInvalid`。
- 表单脏值时接入 `useUnsavedChanges`，使用 `confirmClose` 作为 Modal 的 `closeGuard`。
- 桌面端首字段用 `data-autofocus`；触屏设备由 Modal 自动跳过，避免弹出键盘。

## 列表与响应式

- 桌面表格容器使用 `hidden md:block`。
- 移动端卡片优先使用 `MobileList` / `MobileListCard`；`DataTable` 提供 `mobileCard`。
- 移动端操作触控区不小于 44px；禁止仅 hover 可见的关键操作。
- 分页统一使用 `Pagination`，移动端自动切换紧凑模式。
- 弹窗内表格使用横向滚动，避免在 Modal 内再嵌套纵向滚动区。

## 仪表盘信息层级

- 顺序固定为「系统告警 → 业务待办 → 运营概览 → Owner 治理/安全监控（默认收起） → 最近留言/SSO（默认收起）」，行动优先于展示。
- 系统异常单独使用页头 `SystemAlertIndicator`，仅在存在异常时渲染；不要混进业务待办。
- 系统告警按处理权限显示：注销失败需 `users:security:write`，Webhook 需 `webhooks:read`，定时任务需 `cron:read`。
- 业务待办使用 `PendingQueue`，按权限裁剪，只显示有积压的队列，并展示「最老 X 天」；全部为 0 时展示「已全部清零」。
- 消费补录是用户站外消费申报/同步，仅代表会员运营数据，不是站内营收；金额文案使用「申报 ¥N」。
- 站内没有订单/支付，产品为站外购买链接：禁止在仪表盘增加营收、GMV、成交、经营数据等模块。
- 同一区块只用一个容器：指标使用 `StatStrip` + 细分隔线，不再为每个指标单独描边成卡片。
- KPI 优先展示「总量 + 今日/本周增量」，避免只有静态累计值。
- Owner 治理、安全与资金监控、最近留言、SSO 概览使用 `CollapsiblePanel`；始终默认收起，不因待审批/高风险/未读自动展开，待办与风险通过一行摘要提示。保护规则等二级信息使用嵌套 `details`。
- 页面内不重复侧边栏导航：快捷操作入口一律放在壳层导航，仪表盘不再堆快捷按钮。
- 区块间距使用 `gap-4`，卡片内边距 16px，数字使用 `tabular-nums`。
- 新增/编辑页的返回按钮使用 `IconButton` 放在 `PageHeader` 左侧，不要嵌进 `h1`；避免 SVG 块级布局把箭头挤到标题上方。

## 侧边栏信息架构

- 分组顺序固定为「仪表盘 → 会员运营 → 商品管理 → 招聘管理 → 安全与审计 → 系统与集成 → SSO 管理 → 子站概览」。
- 分组由 `adminNavGroups` 显式声明，禁止依赖数组相邻生成；权限过滤后为空的分组整体隐藏。
- 个人安全设置入口固定在侧边栏底部，不占用业务分组。
- 导航待办数量通过 `NavItem.countKey` 绑定 `/api/admin/nav-counts`，禁止在壳层按 href 硬编码判断。
- 折叠模式下保留分组分隔线，避免纯图标导航丢失分组语义。

## 列表状态与 URL

- 列表的 `page/pageSize/筛选/搜索/排序` 统一写入 URL，刷新、分享、前进/后退可恢复。
- 搜索输入防抖后使用 `router.replace`，避免每次击键产生历史记录；翻页/筛选可 `push`。
- 修改筛选自动回到第 1 页；URL 中 `page` 越界时收敛到最后一页。
- 删除/丢弃/终止最后一行时，若当前页已空且 `page > 1`，先回退一页。
- 编辑页保存/取消返回列表时通过 `returnTo`（仅允许 `/admin` 站内路径）保留筛选。
- 移动端 `MobileList` 必须显式传 `isEmpty`；只传 `empty` 文案不会在空数据时自动生效。
- 列表工具栏：搜索框与筛选器在桌面端保持同一行，`Select` 外层用固定宽度容器（不要只给内部 select 加宽度）；批量操作单独成行，避免勾选后挤压筛选器。
- 侧边栏待办用标题后的红色小圆点表示，不使用数字胶囊：留言=未读、注销申请=执行失败、消费审核=待审核、积分礼品=待履约兑换、简历管理=待处理简历；数量放在 `title`/`aria-label` 中。

## 高风险操作 step-up

- 用户删除、管理员账号/角色/权限变更、break-glass 查看、OAuth Client 密钥轮换/缩权/停用/删除、分类编辑：
  服务端必须调用 `requireAdminStepUp`，前端用 `useTotpConfirm` 拉起二次验证。
- 未启用 TOTP 时 fail-closed，引导前往「安全设置」，不得静默放行。
- 一次性恢复码/临时密码弹窗：禁止遮罩、Esc、X 关闭，必须勾选“已保存”后显式关闭。

## 留言备注

- 管理端「回复」字段语义统一为「内部备注」，不会发送给用户；筛选器/徽章/成功提示不得再出现“已回复/发送回复”。
- 留言正文/内部备注、简历文本/下载路径、候选人备注不得写入通用审计 `detail` 原文；只记录是否变更、长度或脱敏值。
- 读取/导出审计详情时对所有查看者再次剥离上述字段（包括 `audit:sensitive:read`），历史遗留数据不会重新暴露。
- 不要用数据迁移直接改写历史 `AuditLog.detail`：会破坏每日审计摘要锚点（`audit-integrity.ts`）的可验证性；历史数据的隔离应在读取侧完成。

## 导出与下载

- CSV/文件导出统一使用 `src/lib/client-download.ts` 的 `downloadFromUrl`（fetch + blob），禁止 `window.open`。
- 这样可携带同源 Cookie、读取 `Content-Disposition` 文件名，并在 401/403/500 时展示服务端错误，不会留下空白标签页。

## 文字对比度

- 管理端次级文字最低使用 `text-brand-charcoal/65`（白底对比度约 5.06:1），更弱层级用 `/70`。
- 禁止在正文、表头、说明、占位符使用 `/25`、`/30`、`/40`、`/50`、`/60` 的 `text-brand-charcoal`；纯装饰图标除外。

## Owner 治理与审批流

- owner 首屏顺序：业务待办 → 运营概览 → Owner 治理 → 安全与资金监控 → 最近留言/SSO。
- Owner 治理卡仅 `role === "owner"` 可见，使用可收起面板，始终默认收起；待审批、待执行、非 owner 越权操作等计数通过摘要提示。
- 审批流：非 owner 达到阈值的操作只能发起申请；owner 审批必须使用一次性 TOTP，不能复用 step-up 缓存。
- AUTO 模式审批通过后立即执行；REQUESTER 模式由申请人在审批中心执行，一次性密钥只返回一次，禁止写入数据库、审计、通知或页面缓存。
- 执行失败可由 owner（AUTO）或申请人（REQUESTER）使用 fresh TOTP 重试；EXECUTING 超过 30 分钟由 cron 回收为执行失败。
- 审批详情不得展示原始密钥；目标手机号/IP 按现有规则脱敏。
- 审批申请与执行必须写审计，业务动作保留原 audit action，并补充 `approvalId` / `requesterId` / `approverId`。

## 高风险操作 step-up 补充

以下操作服务端必须调用 `requireAdminStepUp`：

- 用户状态/生日修改（单个与批量）
- 用户外部身份解绑
- 用户数据导出
- 高德密钥查看
- OAuth Client 创建、普通更新、SSO 授权撤销、SSO 会话终止
- 产品/职位单条删除与批量删除
- 定时任务手动执行
- Webhook 失败记录删除

## 验证

```bash
npx tsc --noEmit
npx eslint <changed-files>
npm test
npm run build
```

手动检查宽度：375 / 768 / 1024 / 1440；重点验证键盘 Tab、Esc、焦点还原、安全区和嵌套弹窗。
