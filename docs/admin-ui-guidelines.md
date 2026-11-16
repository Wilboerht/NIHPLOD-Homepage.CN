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

- 顺序固定为「系统告警 → 业务待办 → 运营概览 → Owner 治理/安全监控（点击弹窗） → 最近留言/SSO（点击弹窗）」，行动优先于展示。
- 系统异常单独使用页头 `SystemAlertIndicator`，仅在存在异常时渲染；不要混进业务待办。
- 系统告警按处理权限显示：注销失败需 `users:security:write`，Webhook 需 `webhooks:read`，定时任务需 `cron:read`。
- 业务待办使用 `PendingQueue`，按权限裁剪，只显示有积压的队列，并展示「最老 X 天」；全部为 0 时展示「已全部清零」。
- 消费补录是用户站外消费申报/同步，仅代表会员运营数据，不是站内营收；金额文案使用「申报 ¥N」。
- 站内没有订单/支付，产品为站外购买链接：禁止在仪表盘增加营收、GMV、成交、经营数据等模块。
- 同一区块只用一个容器：指标使用 `StatStrip` + 细分隔线，不再为每个指标单独描边成卡片。
- KPI 优先展示「总量 + 今日/本周增量」，避免只有静态累计值。
- Owner 治理、安全与资金监控、最近留言、SSO 概览使用 `DashboardModalCard`；卡片只保留一行摘要，点击打开弹窗查看完整内容，不做就地展开。待办与风险通过摘要提示；保护规则等二级信息在弹窗内使用嵌套 `details`。
- 页面内不重复侧边栏导航：快捷操作入口一律放在壳层导航，仪表盘不再堆快捷按钮。
- 区块间距使用 `gap-4`，卡片内边距 16px，数字使用 `tabular-nums`。
- 新增/编辑页的返回按钮使用 `IconButton` 放在 `PageHeader` 左侧，不要嵌进 `h1`；避免 SVG 块级布局把箭头挤到标题上方。

## 侧边栏信息架构

- 分组顺序固定为「仪表盘 → 会员运营 → 商品管理 → 招聘管理 → 安全与审计 → 系统与集成 → 子站概览」；SSO 管理并入系统与集成。
- 分组由 `adminNavGroups` 显式声明，禁止依赖数组相邻生成；权限过滤后为空的分组整体隐藏。
- 个人安全设置入口固定在侧边栏底部，不占用业务分组。
- 导航待办数量通过 `NavItem.countKeys` 绑定 `/api/admin/nav-counts`（支持多来源求和），禁止在壳层按 href 硬编码判断。\n- 系统告警（注销失败、Webhook、定时任务、审批即将过期）在侧边栏底部常驻展示，与仪表盘共用同一告警模型。
- 折叠模式下保留分组分隔线，避免纯图标导航丢失分组语义。
- 新增 `/admin` 页面必须同步在 `src/lib/admin-page-permissions.ts` 注册路径权限；服务端 layout 会对未注册路径 fail-closed（直接访问/刷新/首屏），客户端路由跳转仍由 `RequirePermission` 兜底。API 权限校验是最终防线，任何一层都不能替代 API 校验。

## 列表状态与 URL

- 列表的 `page/pageSize/筛选/搜索/排序` 统一写入 URL，刷新、分享、前进/后退可恢复。
- 搜索输入防抖后使用 `router.replace`，避免每次击键产生历史记录；翻页/筛选可 `push`。
- 修改筛选自动回到第 1 页；URL 中 `page` 越界时收敛到最后一页。
- 删除/丢弃/终止最后一行时，若当前页已空且 `page > 1`，先回退一页。
- 编辑页保存/取消返回列表时通过 `returnTo`（仅允许 `/admin` 站内路径）保留筛选。
- 移动端 `MobileList` 必须显式传 `isEmpty`；只传 `empty` 文案不会在空数据时自动生效。
- 列表工具栏：搜索框与筛选器在桌面端保持同一行，`Select` 外层用固定宽度容器（不要只给内部 select 加宽度）；批量操作单独成行，避免勾选后挤压筛选器。
- 侧边栏待办用标题后的红色小圆点表示，不使用数字胶囊：留言=主站未读+BA 待处理举报、注销申请=执行失败、消费审核=待审核、积分兑换=待履约+售后待处理、简历管理=待处理简历；数量放在 `title`/`aria-label` 中。

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
- Owner 治理卡仅 `role === "owner"` 可见，使用 `DashboardModalCard` 弹窗展示；待审批、待执行、非 owner 越权操作等计数通过卡片摘要提示。
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


## 域中心与页签

- 低频域（SSO、审计、通知投递、积分兑换、BA 平台）使用“一个导航入口 + 域内页签”，页签由 `src/config/admin-sections.ts` 统一声明。
- 页签按权限过滤；权限过滤后只剩一个页签时不渲染页签条。
- 保留现有页面 URL；不要为了合并导航而破坏书签和外部链接。
- 面包屑按“管理后台 > 域中心 > 当前页”生成。

## 详情抽屉与 URL

- 用户、审批、简历、BA 证书等重详情使用右侧抽屉（`Modal variant="drawer"`），移动端全屏。
- 抽屉状态写入 URL（如 `?user=id`、`?approval=id`、`?application=id`、`?certificate=id`），支持刷新、分享和前进/后退。
- 表单类弹窗仍使用居中 Modal，不把未保存草稿写进 URL。

## 敏感信息展示

- 完整手机号、收货地址等 PII 必须使用 `useSensitiveReveal`：默认 5 分钟自动隐藏，并提供手动“隐藏”和倒计时提示。
- 列表类页面到期后重新拉取脱敏数据，避免本地残留明文。
- 导出默认脱敏；需要完整 PII 的导出必须经过权限校验和 TOTP。

## 日期范围

- 列表日期筛选统一使用 `DateRangeFilter`，参数为 `dateFrom` / `dateTo`，按 UTC+8 解析。
- 服务端统一使用 `parseAdminDateRange` 校验，限制最大 366 天。
- 快捷范围：今天、近 7 天、近 30 天、本月。

## 招聘流程

- 阶段：待处理 → 初筛通过 → 待面试 → 已面试 → Offer → 已录用；拒绝/放弃可重新打开。
- 面试安排、评级、标签、来源和状态变更都会写入候选人时间线。
- 看板支持拖拽换阶段；键盘用户可通过详情抽屉查看候选人并操作状态。
- 候选人导出固定脱敏手机号，需要 `applications:export` + TOTP。

## 移动端

- 375px 下所有管理页必须可用；表格优先提供 `mobileCard`，弹窗内表格允许横向滚动。
- 抽屉、页签、筛选工具栏在窄屏下允许横向滚动或自然换行，不得压缩到不可操作。

## 状态与角色显示

- 二进制状态在**有表头的桌面表格**中可用纯图标：`CircleCheck` 绿色=启用、`CircleX` 红色=禁用；必须同时提供 `title` 与 `sr-only` 文本，筛选器保留文字。
- 移动端卡片没有表头，状态必须使用“图标 + 短文字”，不允许纯图标。
- 二次验证：`ShieldCheck`=已绑定、`ShieldOff`=未绑定；`ShieldAlert` + “待重绑”文字，异常状态不允许纯图标。
- 角色列只允许一个徽标：
  - owner 显示“主管理员”；
  - 非 owner 且存在个人权限覆盖时统一显示“自定义管理”；
  - 其余显示基础角色标签。
- 测肤/验真权限列使用“全部权限 / 管理员 / 部分权限 / 无”，不使用“超管”。
- “自定义管理”必须可通过 `title`/`sr-only` 说明基础角色与权限差异（如“基于运营角色，权限 +2/-1”）；编辑弹窗仍展示基础角色与权限模板。
- 角色筛选中的“自定义管理”是特殊选项，走 `customized=1`，不新增第二个下拉。
- 安全说明、帮助文案继续使用“超级管理员”全称；角色标签使用“主管理员”。

## 视觉 token

- 表面：`bg-surface` / `bg-surface-subtle` / `bg-surface-muted` / `bg-surface-hover`。
- 线条：`border-line` / `border-line-subtle` / `border-line-strong`。
- 文字：`text-ink-secondary` / `text-ink-muted` / `text-ink-faint`（`faint` 仅装饰）。
- 状态：`bg-status-*-soft` / `text-status-*-fg` / `border-status-*-line`。
- 字号：正文最小 `text-xs`；元信息用 `text-2xs`（11/16）；10px 仅图表轴。
- 圆角：控件 `rounded-control`、浮层 `rounded-surface`、卡片 `rounded-card`。
- 浮层阴影：`shadow-popover` / `shadow-modal`；卡片保持描边，不加阴影。
- 行高：默认 44px，紧凑 40px；不再使用 36px 数据行。
- 焦点：`focus-visible:ring-2 ring-brand-primary/40 ring-offset-2`，鼠标点击不显示焦点环。
- 对比度：正文/说明 ≥ `/70`，辅助 ≥ `/65`；`/45` 以下只允许装饰图标。

## Toast

- admin 桌面：右上角、页头操作区下方（`top-24 right-6`），宽 360px，避免遮挡“刷新/新增/保存”。
- admin 移动/平板：sticky 顶栏下方、左右 16px、全宽；不允许右上角。
- 官网保持顶部居中；`ToastProvider` 用 pathname 区分，排除 `/admin-login`。
- 默认时长：success 3s、info 4s、warning 6s、error 8s 或常驻；hover/focus 暂停。
- 相同 `type + message` 2 秒去重；最多同时 3 条；错误必须可手动关闭。
- 反馈优先级：页面加载/筛选失败用内联错误；表单字段校验用字段错误；Toast 只报异步操作结果。
- 长任务使用 `loading` → `update`，不要只靠按钮 spinner。


## 验证

```bash
npx tsc --noEmit
npx eslint <changed-files>
npm test
npm run build
```

手动检查宽度：375 / 768 / 1024 / 1440；重点验证键盘 Tab、Esc、焦点还原、安全区和嵌套弹窗。
