/**
 * 审批流灰度开关：显式设置为 false 时跳过路由层的审批拦截，
 * 已存在的审批申请仍可在审批中心查看和处理。
 */
export function isAdminApprovalEnforced(): boolean {
  return process.env.ADMIN_APPROVAL_ENABLED !== "false";
}
