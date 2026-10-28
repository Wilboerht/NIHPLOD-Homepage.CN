import { prisma } from "./prisma";
import { createAuditLog, createAuditLogTx, type AuditAction, type AuditTargetType } from "./audit";
import { adjustPoints } from "./points-ledger";
import { cancelRedemption } from "./point-gifts";
import { reviewApplication, undoApplication } from "./spent-adjustments";
import {
  executeImportBatch,
  undoImportBatch,
  verifyImportPreviewToken,
  type ExecuteRowInput,
} from "./spent-import";
import { deleteAdminsSafely } from "./admin-safety";
import { changeUserStatus } from "./user-status";
import { DELETION_LEASE_MS, DELETION_STATUS, executeAccountDeletion } from "./account-deletion";
import { hashIdentifier } from "./auth-security";
import { createAdminTotpRecovery } from "./admin-totp-recovery";
import { recordSsoEvent } from "./sso-audit";
import { maskPhone } from "./mask-phone";
import { AdminApprovalError } from "./admin-approval-errors";
import {
  adminDeletePayloadSchema,
  pointsAdjustPayloadSchema,
  redemptionCancelPayloadSchema,
  spentImportExecutePayloadSchema,
  spentImportUndoPayloadSchema,
  spentReviewApprovePayloadSchema,
  spentReviewUndoPayloadSchema,
  totpRecoveryPayloadSchema,
  userDeletePayloadSchema,
  userStatusPayloadSchema,
  type ApprovalPolicyKey,
} from "./admin-approval-policy";

export interface ApprovalExecutorContext {
  approvalId: string;
  policyKey: ApprovalPolicyKey;
  payload: Record<string, unknown>;
  targetId: string | null;
  targetLabel: string | null;
  targetSnapshot: Record<string, unknown> | null;
  /** 申请人填写的审批原因（用于删除原因等业务留痕） */
  reason: string;
  requester: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
  };
  approver: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
  };
}

export interface ApprovalExecutorResult {
  resultMeta?: Record<string, unknown>;
  secret?: string;
}

function assertSnapshot(ctx: ApprovalExecutorContext, checks: Record<string, unknown>): void {
  for (const [key, actual] of Object.entries(checks)) {
    const expected = ctx.targetSnapshot?.[key];
    if (expected !== undefined && expected !== actual) {
      throw new AdminApprovalError("STALE", "目标数据已变化，请重新发起申请", 409);
    }
  }
}

async function writeExecutorAudit(params: {
  ctx: ApprovalExecutorContext;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await createAuditLog({
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId ?? undefined,
    targetLabel: params.targetLabel ?? undefined,
    detail: {
      ...params.detail,
      approvalId: params.ctx.approvalId,
      requesterId: params.ctx.requester.id,
      approverId: params.ctx.approver.id,
    },
    actorType: "ADMIN",
    actorEmail: params.ctx.approver.email ?? undefined,
    actorName: params.ctx.approver.name ?? undefined,
    actorRole: params.ctx.approver.role,
    authMethod: "approval",
    adminId: params.ctx.approver.id,
  });
}

async function executePointsAdjust(ctx: ApprovalExecutorContext): Promise<ApprovalExecutorResult> {
  const payload = pointsAdjustPayloadSchema.parse(ctx.payload);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, status: true },
  });
  if (!user) throw new AdminApprovalError("TARGET_NOT_FOUND", "用户不存在", 404);
  if (user.status === "DELETED") {
    throw new AdminApprovalError("TARGET_DELETED", "已注销用户不可调整积分", 409);
  }
  assertSnapshot(ctx, { status: user.status });

  const reference = `approval:${ctx.approvalId}`;
  const result = await prisma.$transaction(async (tx) => {
    const adjusted = await adjustPoints(tx, {
      userId: payload.userId,
      amount: payload.amount,
      reference,
      note: payload.note,
    });
    if (adjusted.duplicated) return { duplicated: true, available: null as number | null };

    const balance = await tx.pointBalance.findUnique({
      where: { userId: payload.userId },
      select: { available: true },
    });
    const available = balance?.available ?? 0;
    await createAuditLogTx(tx, {
      action: "user_points_adjust",
      targetType: "user",
      targetId: payload.userId,
      detail: {
        amount: payload.amount,
        note: payload.note,
        reference,
        balanceAfter: available,
        approvalId: ctx.approvalId,
        requesterId: ctx.requester.id,
        approverId: ctx.approver.id,
      },
      actorType: "ADMIN",
      actorEmail: ctx.approver.email ?? undefined,
      actorName: ctx.approver.name ?? undefined,
      actorRole: ctx.approver.role,
      authMethod: "approval",
      adminId: ctx.approver.id,
    });
    return { duplicated: false, available };
  });

  return { resultMeta: result };
}

async function executeRedemptionCancel(
  ctx: ApprovalExecutorContext
): Promise<ApprovalExecutorResult> {
  const payload = redemptionCancelPayloadSchema.parse(ctx.payload);
  const redemption = await prisma.pointRedemption.findUnique({
    where: { id: payload.redemptionId },
    select: { id: true, userId: true, points: true, status: true, productName: true },
  });
  if (!redemption) throw new AdminApprovalError("TARGET_NOT_FOUND", "兑换记录不存在", 404);
  if (redemption.status !== "PENDING") {
    throw new AdminApprovalError("STALE", "兑换记录已处理，申请已过期", 409);
  }
  assertSnapshot(ctx, { status: redemption.status, points: redemption.points });

  const result = await cancelRedemption({
    redemptionId: payload.redemptionId,
    note: payload.note,
  });
  if (!result.ok) {
    throw new AdminApprovalError(
      result.code === "ALREADY_PROCESSED" ? "STALE" : "EXECUTION_FAILED",
      result.code === "ALREADY_PROCESSED" ? "兑换记录已处理" : "取消兑换失败",
      result.code === "ALREADY_PROCESSED" ? 409 : 500
    );
  }

  await writeExecutorAudit({
    ctx,
    action: "point_redemption_cancel",
    targetType: "point_redemption",
    targetId: redemption.id,
    targetLabel: redemption.productName,
    detail: {
      refundedPoints: result.points ?? 0,
      note: payload.note ?? null,
      userId: redemption.userId,
    },
  });

  return { resultMeta: { refundedPoints: result.points ?? 0 } };
}

async function executeSpentReviewApprove(
  ctx: ApprovalExecutorContext
): Promise<ApprovalExecutorResult> {
  const payload = spentReviewApprovePayloadSchema.parse(ctx.payload);
  const application = await prisma.spentAdjustmentApplication.findUnique({
    where: { id: payload.applicationId },
    select: { id: true, userId: true, status: true, amountClaimed: true, reviewAmount: true },
  });
  if (!application) throw new AdminApprovalError("TARGET_NOT_FOUND", "消费补录不存在", 404);
  if (application.status !== "PENDING") {
    throw new AdminApprovalError("STALE", "消费补录已处理，申请已过期", 409);
  }
  assertSnapshot(ctx, {
    status: application.status,
    amountClaimed: application.amountClaimed,
    reviewAmount: application.reviewAmount,
  });

  const result = await reviewApplication({
    applicationId: payload.applicationId,
    decision: "approve",
    adminId: ctx.approver.id,
    reviewAmount: payload.reviewAmount,
    reviewNote: payload.reviewNote,
  });
  if (!result.ok) {
    throw new AdminApprovalError(
      result.code === "ALREADY_REVIEWED" ? "STALE" : "EXECUTION_FAILED",
      result.message,
      result.code === "ALREADY_REVIEWED" ? 409 : 400
    );
  }

  await writeExecutorAudit({
    ctx,
    action: "approve_spent_adjustment",
    targetType: "spent_adjustment",
    targetId: application.id,
    detail: {
      decision: "approve",
      reviewAmount: payload.reviewAmount,
      reviewNote: payload.reviewNote ?? null,
      userId: application.userId,
      amountClaimed: application.amountClaimed,
    },
  });

  return { resultMeta: { status: result.status } };
}

async function executeSpentReviewUndo(
  ctx: ApprovalExecutorContext
): Promise<ApprovalExecutorResult> {
  const payload = spentReviewUndoPayloadSchema.parse(ctx.payload);
  const application = await prisma.spentAdjustmentApplication.findUnique({
    where: { id: payload.applicationId },
    select: { id: true, userId: true, status: true, amountClaimed: true, reviewAmount: true },
  });
  if (!application) throw new AdminApprovalError("TARGET_NOT_FOUND", "消费补录不存在", 404);
  if (application.status !== "APPROVED") {
    throw new AdminApprovalError("STALE", "消费补录状态已变化，申请已过期", 409);
  }
  assertSnapshot(ctx, {
    status: application.status,
    amountClaimed: application.amountClaimed,
    reviewAmount: application.reviewAmount,
  });

  const result = await undoApplication({
    applicationId: payload.applicationId,
    adminId: ctx.approver.id,
  });
  if (!result.ok) {
    throw new AdminApprovalError(
      result.code === "NOT_APPROVED" ? "STALE" : "EXECUTION_FAILED",
      result.message,
      result.code === "NOT_APPROVED" ? 409 : 400
    );
  }

  await writeExecutorAudit({
    ctx,
    action: "undo_spent_adjustment",
    targetType: "spent_adjustment",
    targetId: application.id,
    detail: {
      decision: "undo",
      reviewAmount: application.reviewAmount,
      userId: application.userId,
    },
  });

  return { resultMeta: { status: result.status } };
}

async function executeSpentImport(ctx: ApprovalExecutorContext): Promise<ApprovalExecutorResult> {
  const payload = spentImportExecutePayloadSchema.parse(ctx.payload);
  // 预览令牌由申请人会话签发：审批由 owner 完成，但导入仍必须以申请人身份校验令牌。
  const verified = verifyImportPreviewToken(payload.previewToken, ctx.requester.id);
  if (!verified.ok) {
    throw new AdminApprovalError(
      verified.code,
      verified.message,
      verified.code === "TOKEN_EXPIRED" ? 410 : 400
    );
  }

  const { fileName, fileHash, rows } = verified.payload;
  const selectedIndexes = payload.rowIndexes ? new Set(payload.rowIndexes) : null;
  const selectedRows = selectedIndexes
    ? rows.filter((row) => selectedIndexes.has(row.rowIndex))
    : rows;
  if (selectedIndexes && selectedRows.length !== selectedIndexes.size) {
    throw new AdminApprovalError("INVALID_ROW_INDEX", "审批申请包含不存在的导入行", 400);
  }
  if (selectedRows.some((row) => row.error || !row.phone || row.amount === null)) {
    throw new AdminApprovalError("INVALID_ROWS", "审批申请包含未通过预览校验的行", 400);
  }

  const resolvedRows: ExecuteRowInput[] = selectedRows.map((row) => ({
    phone: row.phone as string,
    amount: row.amount as number,
    channel: row.channel,
    orderNo: row.orderNo,
    purchasedAt: row.purchasedAt,
    note: row.note,
  }));
  if (resolvedRows.length === 0) {
    throw new AdminApprovalError("NO_ROWS", "审批申请没有可导入的行", 400);
  }

  const result = await executeImportBatch({
    rows: resolvedRows,
    fileName,
    fileHash,
    reason: payload.reason,
    adminId: ctx.requester.id,
  });

  await writeExecutorAudit({
    ctx,
    action: "import_spent_records",
    targetType: "spent_import",
    targetId: result.batchId,
    detail: {
      fileName,
      fileHash,
      rowCount: resolvedRows.length,
      reason: payload.reason,
      totalRows: result.totalRows,
      successRows: result.successRows,
      duplicateRows: result.duplicateRows,
      errorRows: result.errorRows,
      totalAmount: result.totalAmount,
    },
  });

  return {
    resultMeta: {
      batchId: result.batchId,
      totalRows: result.totalRows,
      successRows: result.successRows,
      duplicateRows: result.duplicateRows,
      errorRows: result.errorRows,
      totalAmount: result.totalAmount,
    },
  };
}

async function executeSpentImportUndo(
  ctx: ApprovalExecutorContext
): Promise<ApprovalExecutorResult> {
  const payload = spentImportUndoPayloadSchema.parse(ctx.payload);
  const batch = await prisma.spentImportBatch.findUnique({
    where: { id: payload.batchId },
    select: { id: true, fileName: true, status: true, undoneAt: true, successRows: true },
  });
  if (!batch) throw new AdminApprovalError("TARGET_NOT_FOUND", "导入批次不存在", 404);
  if (batch.undoneAt) throw new AdminApprovalError("STALE", "该批次已撤销", 409);
  if (batch.status === "PROCESSING") {
    throw new AdminApprovalError("STALE", "该批次仍在处理中，暂不可撤销", 409);
  }
  assertSnapshot(ctx, { status: batch.status });

  const result = await undoImportBatch(payload.batchId);
  if (!result.ok) {
    throw new AdminApprovalError(
      result.code === "REVERSAL_EXCEEDS_BALANCE" ? "STALE" : "EXECUTION_FAILED",
      result.message,
      result.code === "REVERSAL_EXCEEDS_BALANCE" ? 409 : 400
    );
  }

  await writeExecutorAudit({
    ctx,
    action: "undo_spent_import",
    targetType: "spent_import",
    targetId: batch.id,
    targetLabel: batch.fileName,
    detail: {
      revertedRows: result.revertedRows,
      totalAmount: result.totalAmount,
      reason: payload.reason,
    },
  });

  return {
    resultMeta: { revertedRows: result.revertedRows, totalAmount: result.totalAmount },
  };
}

async function executeAdminDelete(ctx: ApprovalExecutorContext): Promise<ApprovalExecutorResult> {
  const payload = adminDeletePayloadSchema.parse(ctx.payload);
  if (payload.adminId === ctx.requester.id) {
    throw new AdminApprovalError("SELF_DELETE", "不能申请删除自己的账号", 400);
  }

  const target = await prisma.admin.findUnique({
    where: { id: payload.adminId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!target || target.deletedAt) {
    throw new AdminApprovalError("STALE", "管理员不存在或已删除", 409);
  }
  assertSnapshot(ctx, { role: target.role, status: target.status });

  const approver = await prisma.admin.findUnique({
    where: { id: ctx.approver.id },
    select: { id: true, role: true, permissions: true, status: true, deletedAt: true },
  });
  if (!approver || approver.status !== "ACTIVE" || approver.deletedAt) {
    throw new AdminApprovalError("APPROVER_INACTIVE", "审批人账号不可用", 409);
  }

  const result = await deleteAdminsSafely({
    actorId: approver.id,
    actorRole: approver.role,
    actorOverrides: approver.permissions ?? [],
    targetIds: [payload.adminId],
    reason: ctx.reason,
  });
  if (!result.ok) {
    throw new AdminApprovalError(result.code, result.message, result.status);
  }

  await writeExecutorAudit({
    ctx,
    action: "delete_admin",
    targetType: "admin",
    targetId: target.id,
    targetLabel: target.name || target.email,
    detail: {
      email: target.email,
      name: target.name,
      role: target.role,
    },
  });

  return { resultMeta: { deletedAdminId: target.id } };
}

async function executeUserStatus(ctx: ApprovalExecutorContext): Promise<ApprovalExecutorResult> {
  const payload = userStatusPayloadSchema.parse(ctx.payload);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, phone: true, status: true },
  });
  if (!user) throw new AdminApprovalError("TARGET_NOT_FOUND", "用户不存在", 404);
  if (user.status === "DELETED") {
    throw new AdminApprovalError("TARGET_DELETED", "已注销用户不可修改状态", 409);
  }
  assertSnapshot(ctx, { status: user.status });
  if (user.status === payload.status) {
    throw new AdminApprovalError("STALE", "用户状态已变化，申请已过期", 409);
  }

  const result = await changeUserStatus({
    userId: user.id,
    expectedStatus: user.status,
    newStatus: payload.status,
  });
  if (!result.changed) {
    throw new AdminApprovalError("STALE", "用户状态已变化，请重新发起", 409);
  }

  await writeExecutorAudit({
    ctx,
    action: "user_status_change",
    targetType: "user",
    targetId: user.id,
    targetLabel: maskPhone(user.phone),
    detail: {
      previousStatus: user.status,
      newStatus: payload.status,
      phone: maskPhone(user.phone),
    },
  });

  await recordSsoEvent({
    event: "status_change",
    userId: user.id,
    success: true,
    detail: {
      action:
        payload.status === "ACTIVE"
          ? "user_unbanned"
          : payload.status === "SUSPENDED"
            ? "user_suspended"
            : "user_banned",
      previousStatus: user.status,
      newStatus: payload.status,
      adminId: ctx.approver.id,
      approvalId: ctx.approvalId,
      requesterId: ctx.requester.id,
    },
  });

  return { resultMeta: { previousStatus: user.status, newStatus: payload.status } };
}

async function executeUserDelete(ctx: ApprovalExecutorContext): Promise<ApprovalExecutorResult> {
  const payload = userDeletePayloadSchema.parse(ctx.payload);
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, phone: true, status: true },
  });
  if (!user) throw new AdminApprovalError("TARGET_NOT_FOUND", "用户不存在", 404);
  if (user.status === "DELETED") {
    throw new AdminApprovalError("STALE", "该用户已注销", 409);
  }
  assertSnapshot(ctx, { status: user.status });

  const existingRequest = await prisma.accountDeletionRequest.findUnique({
    where: { userId: user.id },
    select: { status: true, lockedAt: true },
  });
  const now = new Date();
  const freshRunning =
    existingRequest?.status === DELETION_STATUS.RUNNING &&
    (!existingRequest.lockedAt ||
      existingRequest.lockedAt.getTime() > now.getTime() - DELETION_LEASE_MS);
  if (freshRunning) {
    throw new AdminApprovalError("DELETION_IN_PROGRESS", "该用户注销正在执行中", 409);
  }

  const deletionRequest = await prisma.accountDeletionRequest.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      reason: "管理端删除（审批流）",
      phoneHash: hashIdentifier(user.phone),
      scheduledAt: now,
    },
    update: {
      status: DELETION_STATUS.PENDING,
      reason: "管理端删除（审批流）",
      phoneHash: hashIdentifier(user.phone),
      requestedAt: now,
      scheduledAt: now,
      cancelledAt: null,
      completedAt: null,
      attempts: 0,
      lastError: null,
      lockedAt: null,
      leaseToken: null,
    },
  });

  const result = await executeAccountDeletion(deletionRequest.id, { notifyUser: false });
  if (result !== "completed") {
    throw new AdminApprovalError("DELETION_FAILED", "注销执行失败，申请已转入人工队列", 502);
  }

  await writeExecutorAudit({
    ctx,
    action: "user_deleted",
    targetType: "user",
    targetId: user.id,
    targetLabel: maskPhone(user.phone),
    detail: {
      previousStatus: user.status,
      requestId: deletionRequest.id,
      phone: maskPhone(user.phone),
    },
  });

  await recordSsoEvent({
    event: "status_change",
    userId: user.id,
    success: true,
    detail: {
      action: "user_deleted",
      previousStatus: user.status,
      newStatus: "DELETED",
      adminId: ctx.approver.id,
      approvalId: ctx.approvalId,
      requesterId: ctx.requester.id,
    },
  });

  return { resultMeta: { requestId: deletionRequest.id } };
}

async function executeTotpRecovery(ctx: ApprovalExecutorContext): Promise<ApprovalExecutorResult> {
  const payload = totpRecoveryPayloadSchema.parse(ctx.payload);
  if (payload.adminId === ctx.requester.id) {
    throw new AdminApprovalError("SELF_RECOVERY_FORBIDDEN", "不能为自己申请恢复码", 400);
  }

  const target = await prisma.admin.findUnique({
    where: { id: payload.adminId, deletedAt: null },
    select: {
      id: true,
      email: true,
      status: true,
      totpEnabled: true,
      totpResetRequired: true,
    },
  });
  if (!target) throw new AdminApprovalError("TARGET_NOT_FOUND", "管理员不存在", 404);
  if (target.status !== "ACTIVE") {
    throw new AdminApprovalError("TARGET_INACTIVE", "目标管理员不可用", 400);
  }
  if (!target.totpEnabled && !target.totpResetRequired) {
    throw new AdminApprovalError("TOTP_NOT_ENABLED", "目标管理员未启用 TOTP", 400);
  }
  assertSnapshot(ctx, {
    status: target.status,
    totpEnabled: target.totpEnabled,
    totpResetRequired: target.totpResetRequired,
  });

  const recovery = await createAdminTotpRecovery({
    adminId: target.id,
    createdBy: ctx.approver.id,
    reason: payload.reason,
  });

  await writeExecutorAudit({
    ctx,
    action: "admin_totp_recovery_issued",
    targetType: "admin",
    targetId: target.id,
    targetLabel: target.email,
    detail: {
      targetEmail: target.email,
      reason: payload.reason,
      expiresInMinutes: 10,
    },
  });

  return {
    secret: recovery.code,
    resultMeta: {
      targetEmail: target.email,
      expiresAt: recovery.expiresAt.toISOString(),
    },
  };
}

export async function executeApprovalPolicy(
  ctx: ApprovalExecutorContext
): Promise<ApprovalExecutorResult> {
  switch (ctx.policyKey) {
    case "points.adjust":
      return executePointsAdjust(ctx);
    case "redemption.cancel":
      return executeRedemptionCancel(ctx);
    case "spent.review.approve":
      return executeSpentReviewApprove(ctx);
    case "spent.review.undo":
      return executeSpentReviewUndo(ctx);
    case "spent.import.execute":
      return executeSpentImport(ctx);
    case "spent.import.undo":
      return executeSpentImportUndo(ctx);
    case "admin.delete":
      return executeAdminDelete(ctx);
    case "user.status":
      return executeUserStatus(ctx);
    case "user.delete":
      return executeUserDelete(ctx);
    case "totp.recovery.issue":
      return executeTotpRecovery(ctx);
    default:
      throw new AdminApprovalError("UNKNOWN_POLICY", "不支持的审批操作", 400);
  }
}
