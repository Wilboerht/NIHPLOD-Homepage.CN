import { z } from "zod";
import type { AdminPermission } from "./admin-permissions";

export const APPROVAL_POLICY_KEYS = [
  "points.adjust",
  "redemption.cancel",
  "spent.review.approve",
  "spent.review.undo",
  "admin.delete",
  "user.status",
  "user.delete",
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
  requestPermission: AdminPermission;
  payloadSchema: z.ZodTypeAny;
  summary: string;
}

export const APPROVAL_THRESHOLDS = {
  pointsAdjust: 1000,
  redemptionCancel: 1000,
  spentReviewApprove: 5000,
} as const;

export const pointsAdjustPayloadSchema = z.object({
  userId: z.string().cuid(),
  amount: z
    .number()
    .int()
    .refine((value) => value !== 0, "调整分值不能为 0")
    .refine((value) => Math.abs(value) <= 1_000_000, "单次调整绝对值不能超过 1,000,000"),
  note: z.string().trim().min(2, "请填写调整原因").max(200, "调整原因过长"),
});

export const redemptionCancelPayloadSchema = z.object({
  redemptionId: z.string().cuid(),
  note: z.string().trim().max(200, "取消原因过长").optional(),
});

export const spentReviewApprovePayloadSchema = z.object({
  applicationId: z.string().cuid(),
  reviewAmount: z.number().int().min(1),
  reviewNote: z.string().trim().max(500, "备注过长").optional(),
});

export const spentReviewUndoPayloadSchema = z.object({
  applicationId: z.string().cuid(),
});

export const adminDeletePayloadSchema = z.object({
  adminId: z.string().cuid(),
});

export const userStatusPayloadSchema = z.object({
  userId: z.string().cuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]),
});

export const userDeletePayloadSchema = z.object({
  userId: z.string().cuid(),
});

export const totpRecoveryPayloadSchema = z.object({
  adminId: z.string().cuid(),
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
    payloadSchema: redemptionCancelPayloadSchema,
    summary: "非 owner 取消兑换且退分达到 1000 分时需要 owner 审批",
  },
  "spent.review.approve": {
    key: "spent.review.approve",
    label: "通过消费补录",
    action: "approve_spent_adjustment",
    targetType: "spent_adjustment",
    executionMode: "AUTO",
    requestPermission: "spent:read",
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
    payloadSchema: spentReviewUndoPayloadSchema,
    summary: "非 owner 撤销已通过的消费补录需要 owner 审批",
  },
  "admin.delete": {
    key: "admin.delete",
    label: "删除管理员",
    action: "delete_admin",
    targetType: "admin",
    executionMode: "AUTO",
    requestPermission: "admins:read",
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
    payloadSchema: userDeletePayloadSchema,
    summary: "非 owner 删除/匿名化用户需要 owner 审批",
  },
  "totp.recovery.issue": {
    key: "totp.recovery.issue",
    label: "签发 TOTP 恢复码",
    action: "admin_totp_recovery_issued",
    targetType: "admin",
    executionMode: "REQUESTER",
    requestPermission: "admins:read",
    payloadSchema: totpRecoveryPayloadSchema,
    summary: "owner 审批通过后，由申请人执行并领取一次性恢复码",
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

export function isSpentReviewApprovalRequired(reviewAmount: number): boolean {
  return reviewAmount >= APPROVAL_THRESHOLDS.spentReviewApprove;
}
