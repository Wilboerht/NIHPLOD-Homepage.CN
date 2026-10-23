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

## 列表状态与 URL

- 列表的 `page/pageSize/筛选/搜索/排序` 统一写入 URL，刷新、分享、前进/后退可恢复。
- 搜索输入防抖后使用 `router.replace`，避免每次击键产生历史记录；翻页/筛选可 `push`。
- 修改筛选自动回到第 1 页；URL 中 `page` 越界时收敛到最后一页。
- 删除/丢弃/终止最后一行时，若当前页已空且 `page > 1`，先回退一页。
- 编辑页保存/取消返回列表时通过 `returnTo`（仅允许 `/admin` 站内路径）保留筛选。
- 移动端 `MobileList` 必须显式传 `isEmpty`；只传 `empty` 文案不会在空数据时自动生效。

## 高风险操作 step-up

- 用户删除、管理员账号/角色/权限变更、break-glass 查看、OAuth Client 密钥轮换/缩权/停用/删除：
  服务端必须调用 `requireAdminStepUp`，前端用 `useTotpConfirm` 拉起二次验证。
- 未启用 TOTP 时 fail-closed，引导前往「安全设置」，不得静默放行。
- 一次性恢复码/临时密码弹窗：禁止遮罩、Esc、X 关闭，必须勾选“已保存”后显式关闭。

## 留言备注

- 管理端「回复」字段语义统一为「内部备注」，不会发送给用户；筛选器/徽章/成功提示不得再出现“已回复/发送回复”。

## 验证

```bash
npx tsc --noEmit
npx eslint <changed-files>
npm test
npm run build
```

手动检查宽度：375 / 768 / 1024 / 1440；重点验证键盘 Tab、Esc、焦点还原、安全区和嵌套弹窗。
