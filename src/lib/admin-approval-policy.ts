import { z } from "zod";
import { cuidSchema } from "./validation";
import type { AdminPermission } from "./admin-permissions";

export const APPROVAL_POLICY_KEYS = [
  "points.adjust",
  "redemption.cancel",
  "redemption.refund",
  "spent.review.approve",
  "spent.review.undo",
  "spent.import.execute",
  "spent.import.undo",
  "admin.delete",
  "user.status",
  "user.delete",
  "user.phone.change",
  "user.accounts.merge",
  "totp.recovery.issue",
] as const;

export type ApprovalPolicyKey = (typeof APPROVAL_POLICY_KEYS)[number];
export type ApprovalExecutionMode = "AUTO" | "REQUESTER";

export interface ApprovalPolicy {
  key: ApprovalPolicyKey;
  label: string;
  action: string;
  targetType: string;
  executionMode: ApprovalExecutionMode;
  /** 允许发起申请的最低权限（管理面操作应使用写权限） */
  requestPermission: AdminPermission;
  /** 实际执行该操作所需的业务权限，用于审批页展示“申请人是否原本就能执行” */
  actionPermission: AdminPermission;
  payloadSchema: z.ZodTypeAny;
  summary: string;
  /** 仅供专用入口发起，不在通用“发起审批”下拉框中展示 */
  hidden?: boolean;
}

export const APPROVAL_THRESHOLDS = {
  pointsAdjust: 1000,
  redemptionCancel: 1000,
  redemptionRefund: 10_000,
  spentReviewApprove: 5000,
} as const;

export const SPENT_REVIEW_CUMULATIVE_LIMITS = {
  userDaily: 10_000,
  userWeekly: 30_000,
  reviewerDaily: 20_000,
} as const;

export const pointsAdjustPayloadSchema = z.object({
  userId: cuidSchema,
  amount: z
    .number()
    .int()
    .refine((value) => value !== 0, "调整分值不能为 0")
    .refine((value) => Math.abs(value) <= 1_000_000, "单次调整绝对值不能超过 1,000,000"),
  note: z.string().trim().min(2, "请填写调整原因").max(200, "调整原因过长"),
});

export const redemptionCancelPayloadSchema = z.object({
  redemptionId: cuidSchema,
  note: z.string().trim().max(200, "取消原因过长").optional(),
});

export const redemptionRefundPayloadSchema = z.object({
  redemptionId: cuidSchema,
  note: z.string().trim().max(200, "退款备注过长").optional(),
});

export const spentReviewApprovePayloadSchema = z.object({
  applicationId: cuidSchema,
  reviewAmount: z.number().int().min(1).max(1_000_000, "核实金额不能超过 1,000,000"),
  reviewNote: z.string().trim().max(500, "备注过长").optional(),
});

export const spentReviewUndoPayloadSchema = z.object({
  applicationId: cuidSchema,
});

/** Excel 导入预览令牌由服务端加密签发，内含行快照；审批单只保存密文 */
export const spentImportExecutePayloadSchema = z.object({
  previewToken: z.string().min(1).max(2_000_000),
  rowIndexes: z.array(z.number().int().positive()).max(500).optional(),
  reason: z.string().trim().min(2, "请填写导入原因或工单号").max(200),
});

export const spentImportUndoPayloadSchema = z.object({
  batchId: cuidSchema,
  reason: z.string().trim().min(2, "请填写撤销原因或工单号").max(200),
});

export const adminDeletePayloadSchema = z.object({
  adminId: cuidSchema,
});

export const userStatusPayloadSchema = z.object({
  userId: cuidSchema,
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
});

export const userDeletePayloadSchema = z.object({
  userId: cuidSchema,
});

export const userPhoneChangePayloadSchema = z.object({
  userId: cuidSchema,
  newPhone: z.string().regex(/^1[3-9]\d{9}$/),
  expectedPhoneHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const userAccountMergePayloadSchema = z.object({
  sourceUserId: cuidSchema,
  targetUserId: cuidSchema,
  expectedSourceUpdatedAt: z.string().datetime(),
  expectedTargetUpdatedAt: z.string().datetime(),
  confirmation: z.literal("MERGE"),
});

export const totpRecoveryPayloadSchema = z.object({
  adminId: cuidSchema,
  reason: z.string().trim().min(5, "请填写至少 5 个字符的原因").max(500, "原因过长"),
});

export const APPROVAL_POLICIES: Record<ApprovalPolicyKey, ApprovalPolicy> = {
  "points.adjust": {
    key: "points.adjust",
    label: "人工调整积分",
    action: "user_points_adjust",
    targetType: "user",
    executionMode: "AUTO",
    requestPermission: "users:read",
    actionPermission: "points:adjust",
    payloadSchema: pointsAdjustPayloadSchema,
    summary: "非 owner 单次调整绝对值达到 1000 分时需要 owner 审批",
  },
  "redemption.cancel": {
    key: "redemption.cancel",
    label: "取消兑换并退分",
    action: "point_redemption_cancel",
    targetType: "point_redemption",
    executionMode: "AUTO",
    requestPermission: "redemptions:read",
    actionPermission: "redemptions:cancel",
    payloadSchema: redemptionCancelPayloadSchema,
    summary: "非 owner 取消兑换且退分达到 1000 分时需要 owner 审批",
  },
  "redemption.refund": {
    key: "redemption.refund",
    label: "兑换售后退分",
    action: "refund_point_redemption",
    targetType: "point_redemption",
    executionMode: "AUTO",
    requestPermission: "redemptions:after-sales",
    actionPermission: "redemptions:cancel",
    payloadSchema: redemptionRefundPayloadSchema,
    summary: "非 owner 售后退分达到 10,000 分时需 owner 审批",
    hidden: true,
  },
  "spent.review.approve": {
    key: "spent.review.approve",
    label: "通过消费补录",
    action: "approve_spent_adjustment",
    targetType: "spent_adjustment",
    executionMode: "AUTO",
    requestPermission: "spent:read",
    actionPermission: "spent:review",
    payloadSchema: spentReviewApprovePayloadSchema,
    summary: "非 owner 核实金额达到 ¥5000 时需要 owner 审批",
  },
  "spent.review.undo": {
    key: "spent.review.undo",
    label: "撤销消费补录审核",
    action: "undo_spent_adjustment",
    targetType: "spent_adjustment",
    executionMode: "AUTO",
    requestPermission: "spent:read",
    actionPermission: "spent:review",
    payloadSchema: spentReviewUndoPayloadSchema,
    summary: "非 owner 撤销已通过的消费补录需要 owner 审批",
  },
  "spent.import.execute": {
    key: "spent.import.execute",
    label: "消费记录 Excel 导入",
    action: "import_spent_records",
    targetType: "spent_import",
    // 预览令牌绑定申请人；owner 批准后由执行器以申请人身份消费令牌
    executionMode: "AUTO",
    requestPermission: "spent:import",
    actionPermission: "spent:import",
    payloadSchema: spentImportExecutePayloadSchema,
    summary: "非 owner 执行消费记录 Excel 导入（资金类写操作）需要 owner 审批",
    hidden: true,
  },
  "spent.import.undo": {
    key: "spent.import.undo",
    label: "撤销消费记录 Excel 导入",
    action: "undo_spent_import",
    targetType: "spent_import",
    executionMode: "AUTO",
    requestPermission: "spent:import",
    actionPermission: "spent:import",
    payloadSchema: spentImportUndoPayloadSchema,
    summary: "非 owner 撤销消费记录 Excel 导入（资金类写操作）需要 owner 审批",
    hidden: true,
  },
  "admin.delete": {
    key: "admin.delete",
    label: "删除管理员",
    action: "delete_admin",
    targetType: "admin",
    executionMode: "AUTO",
    requestPermission: "admins:write",
    actionPermission: "admins:write",
    payloadSchema: adminDeletePayloadSchema,
    summary: "非 owner 删除管理员需要 owner 审批",
  },
  "user.status": {
    key: "user.status",
    label: "修改用户状态",
    action: "user_status_change",
    targetType: "user",
    executionMode: "AUTO",
    requestPermission: "users:read",
    actionPermission: "users:write",
    payloadSchema: userStatusPayloadSchema,
    summary: "非 owner 冻结/封禁/恢复用户需要 owner 审批",
  },
  "user.delete": {
    key: "user.delete",
    label: "删除用户",
    action: "user_deleted",
    targetType: "user",
    executionMode: "AUTO",
    requestPermission: "users:read",
    actionPermission: "users:delete",
    payloadSchema: userDeletePayloadSchema,
    summary: "非 owner 删除/匿名化用户需要 owner 审批",
  },
  "user.phone.change": {
    key: "user.phone.change",
    label: "换绑用户手机号",
    action: "user_phone_changed",
    targetType: "user",
    executionMode: "AUTO",
    requestPermission: "users:phone:write",
    actionPermission: "users:phone:write",
    payloadSchema: userPhoneChangePayloadSchema,
    summary: "手机号是登录凭证；非 owner 换绑必须经 owner 审批，执行后撤销全部用户会话",
    hidden: true,
  },
  "user.accounts.merge": {
    key: "user.accounts.merge",
    label: "合并重复用户账户",
    action: "user_accounts_merge",
    targetType: "user",
    executionMode: "AUTO",
    requestPermission: "users:merge",
    actionPermission: "users:merge",
    payloadSchema: userAccountMergePayloadSchema,
    summary: "合并前执行全站预检；任何账本、订单、身份或子站冲突都会拒绝执行",
    hidden: true,
  },
  "totp.recovery.issue": {
    key: "totp.recovery.issue",
    label: "签发 TOTP 恢复码",
    action: "admin_totp_recovery_issued",
    targetType: "admin",
    // 恢复码只能由 owner 执行并直接交付目标本人，不能交给申请人。
    executionMode: "AUTO",
    requestPermission: "admins:write",
    actionPermission: "admins:write",
    payloadSchema: totpRecoveryPayloadSchema,
    summary: "owner 审批通过后立即生成一次性恢复码，只显示给 owner，由 owner 安全交付目标本人",
  },
};

export const APPROVAL_POLICY_LIST: ApprovalPolicy[] = APPROVAL_POLICY_KEYS.map(
  (key) => APPROVAL_POLICIES[key]
);

export function isApprovalPolicyKey(value: string): value is ApprovalPolicyKey {
  return (APPROVAL_POLICY_KEYS as readonly string[]).includes(value);
}

export function getApprovalPolicy(value: string): ApprovalPolicy | null {
  return isApprovalPolicyKey(value) ? APPROVAL_POLICIES[value] : null;
}

export function isPointsAdjustApprovalRequired(amount: number): boolean {
  return Math.abs(amount) >= APPROVAL_THRESHOLDS.pointsAdjust;
}

export function isRedemptionCancelApprovalRequired(points: number): boolean {
  return points >= APPROVAL_THRESHOLDS.redemptionCancel;
}

export function isRedemptionRefundApprovalRequired(points: number): boolean {
  return points >= APPROVAL_THRESHOLDS.redemptionRefund;
}

export function isSpentReviewApprovalRequired(
  reviewAmount: number,
  amountClaimed?: number | null
): boolean {
  // 取申报金额与核实金额的较大值：否则“申报 100 万、核实填 4,999”可绕过 owner 审批。
  return Math.max(reviewAmount, amountClaimed ?? 0) >= APPROVAL_THRESHOLDS.spentReviewApprove;
}
