import { createHash } from "crypto";
import type { AdminApprovalRequest, AdminApprovalStatus } from "@/generated/prisma/client";
import type { AdminUser } from "@/types/auth";
import { prisma } from "./prisma";
import { stableStringify } from "./audit-chain";
import { toInputJson } from "./prisma-json";
import { createAuditLog } from "./audit";
import { hasAdminPermission } from "./admin-permissions";
import { requireFreshAdminTotp } from "./admin-totp";
import { sendWecomNotification } from "./wecom";
import { apiConsole } from "./logger";
import { maskPhone } from "./mask-phone";
import { AdminApprovalError } from "./admin-approval-errors";
import {
  APPROVAL_POLICIES,
  getApprovalPolicy,
  isPointsAdjustApprovalRequired,
  isRedemptionCancelApprovalRequired,
  isSpentReviewApprovalRequired,
  type ApprovalPolicy,
  type ApprovalPolicyKey,
} from "./admin-approval-policy";
import { executeApprovalPolicy, type ApprovalExecutorResult } from "./admin-approval-executors";

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const EXECUTING_TIMEOUT_MS = 30 * 60 * 1000;

export interface ApprovalTarget {
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  targetSnapshot: Record<string, unknown>;
  approvalRequired: boolean;
}

export interface CreateApprovalRequestInput {
  admin: AdminUser;
  policyKey: string;
  payload: unknown;
  reason: string;
}

export interface ApprovalListOptions {
  status?: string;
  policyKey?: string;
  page?: number;
  pageSize?: number;
}

export interface ApprovalDecisionInput {
  admin: AdminUser;
  id: string;
  totpCode: string;
  note?: string;
}

export interface ApprovalExecutionOutcome {
  ok: boolean;
  status: string;
  error?: string;
  secret?: string;
  resultMeta?: Record<string, unknown>;
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function userLabel(user: { nickname: string | null; phone: string }): string {
  return user.nickname || maskPhone(user.phone);
}

async function notifyApprovalEvent(title: string, lines: string[]): Promise<void> {
  try {
    const result = await sendWecomNotification([`## ${title}`, "", ...lines].join("\n"), "admin");
    if (!result.success) {
      apiConsole.warn(`[AdminApproval] 企业微信通知未发送: ${result.error ?? "unknown"}`);
    }
  } catch (error) {
    apiConsole.warn("[AdminApproval] 企业微信通知异常:", error);
  }
}

async function resolveApprovalTarget(
  policy: ApprovalPolicy,
  payload: Record<string, unknown>,
  requesterId: string
): Promise<ApprovalTarget> {
  switch (policy.key) {
    case "points.adjust": {
      const userId = String(payload.userId);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, phone: true, status: true },
      });
      if (!user) throw new AdminApprovalError("TARGET_NOT_FOUND", "用户不存在", 404);
      if (user.status === "DELETED") {
        throw new AdminApprovalError("TARGET_DELETED", "已注销用户不可调整积分", 409);
      }
      return {
        targetType: "user",
        targetId: user.id,
        targetLabel: userLabel(user),
        targetSnapshot: { status: user.status },
        approvalRequired: isPointsAdjustApprovalRequired(Number(payload.amount)),
      };
    }
    case "redemption.cancel": {
      const redemptionId = String(payload.redemptionId);
      const redemption = await prisma.pointRedemption.findUnique({
        where: { id: redemptionId },
        select: {
          id: true,
          userId: true,
          points: true,
          status: true,
          productName: true,
          user: { select: { nickname: true, phone: true } },
        },
      });
      if (!redemption) {
        throw new AdminApprovalError("TARGET_NOT_FOUND", "兑换记录不存在", 404);
      }
      if (redemption.status !== "PENDING") {
        throw new AdminApprovalError("TARGET_NOT_PENDING", "兑换记录已是处理状态", 409);
      }
      return {
        targetType: "point_redemption",
        targetId: redemption.id,
        targetLabel: `${redemption.productName} · ${userLabel(redemption.user)}`,
        targetSnapshot: { status: redemption.status, points: redemption.points },
        approvalRequired: isRedemptionCancelApprovalRequired(redemption.points),
      };
    }
    case "spent.review.approve":
    case "spent.review.undo": {
      const applicationId = String(payload.applicationId);
      const application = await prisma.spentAdjustmentApplication.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          userId: true,
          status: true,
          amountClaimed: true,
          reviewAmount: true,
          user: { select: { nickname: true, phone: true } },
        },
      });
      if (!application) {
        throw new AdminApprovalError("TARGET_NOT_FOUND", "消费补录不存在", 404);
      }
      if (policy.key === "spent.review.approve" && application.status !== "PENDING") {
        throw new AdminApprovalError("TARGET_NOT_PENDING", "消费补录已处理", 409);
      }
      if (policy.key === "spent.review.undo" && application.status !== "APPROVED") {
        throw new AdminApprovalError("TARGET_NOT_APPROVED", "仅已通过的消费补录可撤销", 409);
      }
      return {
        targetType: "spent_adjustment",
        targetId: application.id,
        targetLabel: userLabel(application.user),
        targetSnapshot: {
          status: application.status,
          amountClaimed: application.amountClaimed,
          reviewAmount: application.reviewAmount,
        },
        approvalRequired:
          policy.key === "spent.review.undo" ||
          isSpentReviewApprovalRequired(Number(payload.reviewAmount)),
      };
    }
    case "admin.delete": {
      const adminId = String(payload.adminId);
      const target = await prisma.admin.findUnique({
        where: { id: adminId },
        select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true },
      });
      if (!target || target.deletedAt) {
        throw new AdminApprovalError("TARGET_NOT_FOUND", "管理员不存在", 404);
      }
      if (target.id === requesterId) {
        throw new AdminApprovalError("SELF_DELETE", "不能申请删除自己的账号", 400);
      }
      return {
        targetType: "admin",
        targetId: target.id,
        targetLabel: target.name || target.email,
        targetSnapshot: { role: target.role, status: target.status },
        approvalRequired: true,
      };
    }
    case "user.status": {
      const userId = String(payload.userId);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, phone: true, status: true },
      });
      if (!user) throw new AdminApprovalError("TARGET_NOT_FOUND", "用户不存在", 404);
      if (user.status === "DELETED") {
        throw new AdminApprovalError("TARGET_DELETED", "已注销用户不可修改状态", 409);
      }
      if (user.status === String(payload.status)) {
        throw new AdminApprovalError("NO_CHANGE", "用户状态未变化", 400);
      }
      return {
        targetType: "user",
        targetId: user.id,
        targetLabel: userLabel(user),
        targetSnapshot: { status: user.status },
        approvalRequired: true,
      };
    }
    case "user.delete": {
      const userId = String(payload.userId);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, nickname: true, phone: true, status: true },
      });
      if (!user) throw new AdminApprovalError("TARGET_NOT_FOUND", "用户不存在", 404);
      if (user.status === "DELETED") {
        throw new AdminApprovalError("TARGET_DELETED", "该用户已注销", 409);
      }
      return {
        targetType: "user",
        targetId: user.id,
        targetLabel: userLabel(user),
        targetSnapshot: { status: user.status },
        approvalRequired: true,
      };
    }
    case "totp.recovery.issue": {
      const adminId = String(payload.adminId);
      const target = await prisma.admin.findUnique({
        where: { id: adminId, deletedAt: null },
        select: {
          id: true,
          name: true,
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
      if (target.id === requesterId) {
        throw new AdminApprovalError("SELF_RECOVERY_FORBIDDEN", "不能为自己申请恢复码", 400);
      }
      if (!target.totpEnabled && !target.totpResetRequired) {
        throw new AdminApprovalError("TOTP_NOT_ENABLED", "目标管理员未启用 TOTP", 400);
      }
      return {
        targetType: "admin",
        targetId: target.id,
        targetLabel: target.name || target.email,
        targetSnapshot: {
          status: target.status,
          totpEnabled: target.totpEnabled,
          totpResetRequired: target.totpResetRequired,
        },
        approvalRequired: true,
      };
    }
    default:
      throw new AdminApprovalError("UNKNOWN_POLICY", "不支持的审批操作", 400);
  }
}

function approvalSummary(request: AdminApprovalRequest) {
  return {
    id: request.id,
    policyKey: request.policyKey,
    action: request.action,
    executionMode: request.executionMode,
    targetType: request.targetType,
    targetId: request.targetId,
    targetLabel: request.targetLabel,
    targetSnapshot: request.targetSnapshot,
    payload: request.payload,
    reason: request.reason,
    requesterId: request.requesterId,
    requesterEmail: request.requesterEmail,
    requesterName: request.requesterName,
    requesterRole: request.requesterRole,
    status: request.status,
    approverId: request.approverId,
    approverEmail: request.approverEmail,
    approverName: request.approverName,
    approvedAt: request.approvedAt?.toISOString() ?? null,
    approvalTotpVerifiedAt: request.approvalTotpVerifiedAt?.toISOString() ?? null,
    decisionNote: request.decisionNote,
    executionResult: request.executionResult,
    executedAt: request.executedAt?.toISOString() ?? null,
    error: request.error,
    expiresAt: request.expiresAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export async function createApprovalRequest(input: CreateApprovalRequestInput) {
  const policy = getApprovalPolicy(input.policyKey);
  if (!policy) throw new AdminApprovalError("UNKNOWN_POLICY", "不支持的审批操作", 400);
  if (!hasAdminPermission(input.admin, "approvals:request")) {
    throw new AdminApprovalError("FORBIDDEN", "无权发起审批申请", 403);
  }
  if (input.admin.role === "owner") {
    throw new AdminApprovalError("OWNER_DIRECT_EXECUTION", "owner 可直接执行该操作", 400);
  }
  if (!hasAdminPermission(input.admin, policy.requestPermission)) {
    throw new AdminApprovalError("FORBIDDEN", "无权发起该审批申请", 403);
  }

  const parsed = policy.payloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new AdminApprovalError(
      "INVALID_PARAMS",
      parsed.error.issues[0]?.message || "审批参数错误",
      400
    );
  }
  const payload = JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
  const target = await resolveApprovalTarget(policy, payload, input.admin.id);
  if (!target.approvalRequired) {
    throw new AdminApprovalError("APPROVAL_NOT_REQUIRED", "该操作未达到审批条件，可直接执行", 400);
  }

  const reason = input.reason.trim();
  if (reason.length < 5) {
    throw new AdminApprovalError("INVALID_REASON", "请填写至少 5 个字符的申请原因", 400);
  }

  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
  const payloadHash = hashPayload(payload);
  const duplicate = await prisma.adminApprovalRequest.findFirst({
    where: {
      requesterId: input.admin.id,
      policyKey: policy.key,
      targetId: target.targetId,
      payloadHash,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new AdminApprovalError("DUPLICATE_REQUEST", "已有相同的待审批申请", 409);
  }
  const request = await prisma.adminApprovalRequest.create({
    data: {
      policyKey: policy.key,
      action: policy.action,
      executionMode: policy.executionMode,
      targetType: target.targetType,
      targetId: target.targetId,
      targetLabel: target.targetLabel,
      targetSnapshot: toInputJson(target.targetSnapshot),
      payload: toInputJson(payload)!,
      payloadHash,
      reason,
      requesterId: input.admin.id,
      requesterEmail: input.admin.email,
      requesterName: input.admin.name,
      requesterRole: input.admin.role,
      expiresAt,
    },
  });

  await createAuditLog({
    action: "admin_approval_requested",
    targetType: "system",
    targetId: request.id,
    targetLabel: policy.label,
    detail: {
      approvalId: request.id,
      policyKey: policy.key,
      action: policy.action,
      executionMode: policy.executionMode,
      targetType: target.targetType,
      targetId: target.targetId,
      targetLabel: target.targetLabel,
      payloadHash,
      reason,
      requesterId: input.admin.id,
      expiresAt: expiresAt.toISOString(),
    },
    actorType: "ADMIN",
    actorEmail: input.admin.email,
    actorName: input.admin.name,
    actorRole: input.admin.role,
    authMethod: "session",
    sessionJti: null,
    adminId: input.admin.id,
  });

  void notifyApprovalEvent("新的 Owner 审批申请", [
    `- 操作：${policy.label}`,
    `- 申请人：${input.admin.name || input.admin.email}`,
    `- 对象：${target.targetLabel ?? target.targetId ?? "-"}`,
    `- 原因：${reason}`,
    `- 过期：${expiresAt.toISOString()}`,
  ]);

  return approvalSummary(request);
}

export async function listApprovalRequests(admin: AdminUser, options: ApprovalListOptions = {}) {
  const isReviewer = admin.role === "owner" || hasAdminPermission(admin, "approvals:review");
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const where = {
    ...(isReviewer ? {} : { requesterId: admin.id }),
    ...(options.status ? { status: options.status as AdminApprovalStatus } : {}),
    ...(options.policyKey ? { policyKey: options.policyKey } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.adminApprovalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminApprovalRequest.count({ where }),
  ]);

  return {
    items: items.map(approvalSummary),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function getApprovalRequestForAdmin(admin: AdminUser, id: string) {
  const request = await prisma.adminApprovalRequest.findUnique({ where: { id } });
  if (!request) throw new AdminApprovalError("NOT_FOUND", "审批申请不存在", 404);
  const isReviewer = admin.role === "owner" || hasAdminPermission(admin, "approvals:review");
  if (!isReviewer && request.requesterId !== admin.id) {
    throw new AdminApprovalError("FORBIDDEN", "无权查看该审批申请", 403);
  }
  return request;
}

async function verifyFreshTotp(admin: AdminUser, totpCode: string): Promise<Date> {
  const failure = await requireFreshAdminTotp(admin.id, totpCode);
  if (failure) {
    let code = "TOTP_INVALID";
    let message = "二次验证失败";
    try {
      const body = (await failure.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code || code;
      message = body.error?.message || message;
    } catch {
      // ignore
    }
    throw new AdminApprovalError(code, message, failure.status);
  }
  return new Date();
}

async function markExpired(request: AdminApprovalRequest): Promise<void> {
  const updated = await prisma.adminApprovalRequest.updateMany({
    where: { id: request.id, status: { in: ["PENDING", "APPROVED"] } },
    data: { status: "EXPIRED", error: "审批已过期" },
  });
  if (updated.count === 0) return;
  await createAuditLog({
    action: "admin_approval_expired",
    targetType: "system",
    targetId: request.id,
    targetLabel: request.policyKey,
    detail: { approvalId: request.id, requesterId: request.requesterId },
    actorType: "SYSTEM",
  });
}

function executorContext(
  request: AdminApprovalRequest
): Parameters<typeof executeApprovalPolicy>[0] {
  return {
    approvalId: request.id,
    policyKey: request.policyKey as ApprovalPolicyKey,
    payload: request.payload as Record<string, unknown>,
    targetId: request.targetId,
    targetLabel: request.targetLabel,
    targetSnapshot:
      request.targetSnapshot && typeof request.targetSnapshot === "object"
        ? (request.targetSnapshot as Record<string, unknown>)
        : null,
    requester: {
      id: request.requesterId,
      email: request.requesterEmail,
      name: request.requesterName,
      role: request.requesterRole,
    },
    approver: {
      id: request.approverId ?? "",
      email: request.approverEmail,
      name: request.approverName,
      role: "owner",
    },
  };
}

async function executeApprovedRequest(
  requestId: string,
  options: {
    fromStatus?: "APPROVED" | "EXECUTION_FAILED";
    onClaimed?: (request: AdminApprovalRequest) => Promise<void>;
  } = {}
): Promise<ApprovalExecutionOutcome> {
  const fromStatus = options.fromStatus ?? "APPROVED";
  const request = await prisma.adminApprovalRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new AdminApprovalError("NOT_FOUND", "审批申请不存在", 404);
  if (request.status !== fromStatus) {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请当前不可执行", 409);
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    await markExpired(request);
    throw new AdminApprovalError("EXPIRED", "审批申请已过期", 409);
  }
  if (!request.approverId) {
    throw new AdminApprovalError("NOT_APPROVED", "审批人信息缺失", 409);
  }
  if (request.payloadHash !== hashPayload(request.payload as Record<string, unknown>)) {
    throw new AdminApprovalError("PAYLOAD_CHANGED", "申请参数已变化，请重新发起", 409);
  }

  const claimed = await prisma.adminApprovalRequest.updateMany({
    where: { id: request.id, status: fromStatus },
    data: {
      status: "EXECUTING",
      error: null,
      ...(fromStatus === "EXECUTION_FAILED" ? { executedAt: null } : {}),
    },
  });
  if (claimed.count === 0) {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请已被处理", 409);
  }
  if (options.onClaimed) {
    await options.onClaimed(request);
  }

  try {
    const result: ApprovalExecutorResult = await executeApprovalPolicy(executorContext(request));
    const resultMeta = result.resultMeta ?? {};
    await prisma.adminApprovalRequest.updateMany({
      where: { id: request.id, status: "EXECUTING" },
      data: {
        status: "EXECUTED",
        executionResult: toInputJson(resultMeta),
        executedAt: new Date(),
        error: null,
      },
    });
    await createAuditLog({
      action: "admin_approval_executed",
      targetType: "system",
      targetId: request.id,
      targetLabel: request.policyKey,
      detail: {
        approvalId: request.id,
        requesterId: request.requesterId,
        approverId: request.approverId,
        retried: fromStatus === "EXECUTION_FAILED",
        secretIssued: Boolean(result.secret),
        resultMeta,
      },
      actorType: "ADMIN",
      actorEmail: request.approverEmail ?? undefined,
      actorName: request.approverName ?? undefined,
      actorRole: "owner",
      authMethod: "approval",
      adminId: request.approverId,
    });
    return { ok: true, status: "EXECUTED", secret: result.secret, resultMeta };
  } catch (error) {
    const isStale = error instanceof AdminApprovalError && error.code === "STALE";
    const message = error instanceof Error ? error.message : "审批执行失败";
    await prisma.adminApprovalRequest.updateMany({
      where: { id: request.id, status: "EXECUTING" },
      data: {
        status: isStale ? "STALE" : "EXECUTION_FAILED",
        error: message,
        executedAt: new Date(),
      },
    });
    await createAuditLog({
      action: isStale ? "admin_approval_stale" : "admin_approval_execution_failed",
      targetType: "system",
      targetId: request.id,
      targetLabel: request.policyKey,
      detail: {
        approvalId: request.id,
        requesterId: request.requesterId,
        approverId: request.approverId,
        retried: fromStatus === "EXECUTION_FAILED",
        error: message,
      },
      actorType: "ADMIN",
      actorEmail: request.approverEmail ?? undefined,
      actorName: request.approverName ?? undefined,
      actorRole: "owner",
      authMethod: "approval",
      adminId: request.approverId,
    });
    return {
      ok: false,
      status: isStale ? "STALE" : "EXECUTION_FAILED",
      error: message,
    };
  }
}

export async function retryApprovalRequest(input: ApprovalDecisionInput) {
  const request = await prisma.adminApprovalRequest.findUnique({ where: { id: input.id } });
  if (!request) throw new AdminApprovalError("NOT_FOUND", "审批申请不存在", 404);
  if (request.status !== "EXECUTION_FAILED") {
    throw new AdminApprovalError("INVALID_STATUS", "仅执行失败的审批可以重试", 409);
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    throw new AdminApprovalError("EXPIRED", "审批申请已过期，无法重试", 409);
  }

  if (request.executionMode === "AUTO") {
    if (input.admin.role !== "owner" || !hasAdminPermission(input.admin, "approvals:review")) {
      throw new AdminApprovalError("FORBIDDEN", "仅超级管理员可重试该审批", 403);
    }
  } else {
    if (request.requesterId !== input.admin.id) {
      throw new AdminApprovalError("FORBIDDEN", "只有申请人可以重试该审批", 403);
    }
    if (!hasAdminPermission(input.admin, "approvals:request")) {
      throw new AdminApprovalError("FORBIDDEN", "发起审批权限已失效", 403);
    }
    const policy = getApprovalPolicy(request.policyKey);
    if (!policy || !hasAdminPermission(input.admin, policy.requestPermission)) {
      throw new AdminApprovalError("FORBIDDEN", "审批对应的业务权限已失效", 403);
    }
  }

  const verifiedAt = await verifyFreshTotp(input.admin, input.totpCode);
  const execution = await executeApprovedRequest(request.id, {
    fromStatus: "EXECUTION_FAILED",
    onClaimed: async (claimed) => {
      await createAuditLog({
        action: "admin_approval_retried",
        targetType: "system",
        targetId: claimed.id,
        targetLabel: claimed.policyKey,
        detail: {
          approvalId: claimed.id,
          requesterId: claimed.requesterId,
          approverId: claimed.approverId,
          retriedBy: input.admin.id,
          retriedAt: verifiedAt.toISOString(),
          previousError: claimed.error,
        },
        actorType: "ADMIN",
        actorEmail: input.admin.email,
        actorName: input.admin.name,
        actorRole: input.admin.role,
        authMethod: "totp",
        sessionJti: null,
        adminId: input.admin.id,
      });
    },
  });
  const updated = await prisma.adminApprovalRequest.findUnique({ where: { id: request.id } });
  return {
    request: updated ? approvalSummary(updated) : null,
    execution,
    secret: execution.secret ?? null,
  };
}

export async function approveApprovalRequest(input: ApprovalDecisionInput) {
  if (input.admin.role !== "owner") {
    throw new AdminApprovalError("FORBIDDEN", "仅超级管理员可审批", 403);
  }
  const request = await prisma.adminApprovalRequest.findUnique({ where: { id: input.id } });
  if (!request) throw new AdminApprovalError("NOT_FOUND", "审批申请不存在", 404);
  if (request.status !== "PENDING") {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请已处理", 409);
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    await markExpired(request);
    throw new AdminApprovalError("EXPIRED", "审批申请已过期", 409);
  }
  if (
    request.targetId === input.admin.id &&
    (request.policyKey === "admin.delete" || request.policyKey === "totp.recovery.issue")
  ) {
    throw new AdminApprovalError("SELF_APPROVAL_FORBIDDEN", "不能批准针对自己的高风险申请", 400);
  }

  const verifiedAt = await verifyFreshTotp(input.admin, input.totpCode);
  const claimed = await prisma.adminApprovalRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: "APPROVED",
      approverId: input.admin.id,
      approverEmail: input.admin.email,
      approverName: input.admin.name,
      approvedAt: verifiedAt,
      approvalTotpVerifiedAt: verifiedAt,
      decisionNote: input.note?.trim() || null,
    },
  });
  if (claimed.count === 0) {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请已被处理", 409);
  }

  await createAuditLog({
    action: "admin_approval_approved",
    targetType: "system",
    targetId: request.id,
    targetLabel: request.policyKey,
    detail: {
      approvalId: request.id,
      requesterId: request.requesterId,
      approverId: input.admin.id,
      decisionNote: input.note?.trim() || null,
      approvalTotpVerifiedAt: verifiedAt.toISOString(),
    },
    actorType: "ADMIN",
    actorEmail: input.admin.email,
    actorName: input.admin.name,
    actorRole: input.admin.role,
    authMethod: "totp",
    sessionJti: null,
    adminId: input.admin.id,
  });

  if (request.executionMode === "REQUESTER") {
    void notifyApprovalEvent("审批已通过，待申请人执行", [
      `- 操作：${APPROVAL_POLICIES[request.policyKey as ApprovalPolicyKey]?.label ?? request.policyKey}`,
      `- 申请人：${request.requesterName || request.requesterEmail || request.requesterId}`,
      "- 请申请人前往审批中心执行并领取一次性密钥",
    ]);
    const updated = await prisma.adminApprovalRequest.findUnique({ where: { id: request.id } });
    return { request: updated ? approvalSummary(updated) : null, execution: null };
  }

  const execution = await executeApprovedRequest(request.id);
  const updated = await prisma.adminApprovalRequest.findUnique({ where: { id: request.id } });
  void notifyApprovalEvent(execution.ok ? "审批已通过并执行" : "审批已通过但执行失败", [
    `- 操作：${APPROVAL_POLICIES[request.policyKey as ApprovalPolicyKey]?.label ?? request.policyKey}`,
    `- 申请人：${request.requesterName || request.requesterEmail || request.requesterId}`,
    ...(execution.error ? [`- 错误：${execution.error}`] : []),
  ]);
  return { request: updated ? approvalSummary(updated) : null, execution };
}

export async function rejectApprovalRequest(input: ApprovalDecisionInput) {
  if (input.admin.role !== "owner") {
    throw new AdminApprovalError("FORBIDDEN", "仅超级管理员可审批", 403);
  }
  const request = await prisma.adminApprovalRequest.findUnique({ where: { id: input.id } });
  if (!request) throw new AdminApprovalError("NOT_FOUND", "审批申请不存在", 404);
  if (request.status !== "PENDING") {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请已处理", 409);
  }
  const decisionNote = input.note?.trim() ?? "";
  if (decisionNote.length < 2) {
    throw new AdminApprovalError("INVALID_REASON", "请填写拒绝原因（至少 2 个字符）", 400);
  }

  const verifiedAt = await verifyFreshTotp(input.admin, input.totpCode);
  const claimed = await prisma.adminApprovalRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: {
      status: "REJECTED",
      approverId: input.admin.id,
      approverEmail: input.admin.email,
      approverName: input.admin.name,
      approvedAt: verifiedAt,
      approvalTotpVerifiedAt: verifiedAt,
      decisionNote: input.note?.trim() || null,
    },
  });
  if (claimed.count === 0) {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请已被处理", 409);
  }

  await createAuditLog({
    action: "admin_approval_rejected",
    targetType: "system",
    targetId: request.id,
    targetLabel: request.policyKey,
    detail: {
      approvalId: request.id,
      requesterId: request.requesterId,
      approverId: input.admin.id,
      decisionNote: input.note?.trim() || null,
    },
    actorType: "ADMIN",
    actorEmail: input.admin.email,
    actorName: input.admin.name,
    actorRole: input.admin.role,
    authMethod: "totp",
    sessionJti: null,
    adminId: input.admin.id,
  });

  void notifyApprovalEvent("审批被拒绝", [
    `- 操作：${APPROVAL_POLICIES[request.policyKey as ApprovalPolicyKey]?.label ?? request.policyKey}`,
    `- 申请人：${request.requesterName || request.requesterEmail || request.requesterId}`,
    `- 原因：${input.note?.trim() || "未填写"}`,
  ]);

  const updated = await prisma.adminApprovalRequest.findUnique({ where: { id: request.id } });
  return updated ? approvalSummary(updated) : null;
}

export async function cancelApprovalRequest(admin: AdminUser, id: string) {
  const request = await prisma.adminApprovalRequest.findUnique({ where: { id } });
  if (!request) throw new AdminApprovalError("NOT_FOUND", "审批申请不存在", 404);
  if (request.requesterId !== admin.id) {
    throw new AdminApprovalError("FORBIDDEN", "只能撤回自己的申请", 403);
  }
  if (request.status !== "PENDING") {
    throw new AdminApprovalError("INVALID_STATUS", "当前状态不可撤回", 409);
  }

  const claimed = await prisma.adminApprovalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (claimed.count === 0) {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请已被处理", 409);
  }

  await createAuditLog({
    action: "admin_approval_cancelled",
    targetType: "system",
    targetId: request.id,
    targetLabel: request.policyKey,
    detail: { approvalId: request.id, requesterId: admin.id },
    actorType: "ADMIN",
    actorEmail: admin.email,
    actorName: admin.name,
    actorRole: admin.role,
    authMethod: "session",
    sessionJti: null,
    adminId: admin.id,
  });

  const updated = await prisma.adminApprovalRequest.findUnique({ where: { id } });
  return updated ? approvalSummary(updated) : null;
}

export async function executeRequesterApproval(admin: AdminUser, id: string, totpCode: string) {
  const request = await prisma.adminApprovalRequest.findUnique({ where: { id } });
  if (!request) throw new AdminApprovalError("NOT_FOUND", "审批申请不存在", 404);
  if (request.requesterId !== admin.id) {
    throw new AdminApprovalError("FORBIDDEN", "只有申请人可以执行", 403);
  }
  if (!hasAdminPermission(admin, "approvals:request")) {
    throw new AdminApprovalError("FORBIDDEN", "发起审批权限已失效", 403);
  }
  const policy = getApprovalPolicy(request.policyKey);
  if (!policy || !hasAdminPermission(admin, policy.requestPermission)) {
    throw new AdminApprovalError("FORBIDDEN", "审批对应的业务权限已失效", 403);
  }
  if (request.executionMode !== "REQUESTER") {
    throw new AdminApprovalError("INVALID_MODE", "该审批不支持申请人执行", 400);
  }
  if (request.payloadHash !== hashPayload(request.payload as Record<string, unknown>)) {
    throw new AdminApprovalError("PAYLOAD_CHANGED", "申请参数已变化，请重新发起", 409);
  }
  await verifyFreshTotp(admin, totpCode);
  const execution = await executeApprovedRequest(request.id);
  const updated = await prisma.adminApprovalRequest.findUnique({ where: { id } });
  return {
    request: updated ? approvalSummary(updated) : null,
    execution,
    secret: execution.secret ?? null,
  };
}

export async function expirePendingApprovals(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - EXECUTING_TIMEOUT_MS);
  const staleExecuting = await prisma.adminApprovalRequest.findMany({
    where: { status: "EXECUTING", updatedAt: { lt: staleBefore } },
    take: 100,
    orderBy: { updatedAt: "asc" },
  });
  let count = 0;
  for (const request of staleExecuting) {
    const updated = await prisma.adminApprovalRequest.updateMany({
      where: {
        id: request.id,
        status: "EXECUTING",
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: "EXECUTION_FAILED",
        error: "执行超时，请重试",
        executedAt: now,
      },
    });
    if (updated.count === 0) continue;
    count += 1;
    await createAuditLog({
      action: "admin_approval_execution_failed",
      targetType: "system",
      targetId: request.id,
      targetLabel: request.policyKey,
      detail: {
        approvalId: request.id,
        requesterId: request.requesterId,
        approverId: request.approverId,
        retried: false,
        error: "执行超时",
      },
      actorType: "SYSTEM",
    });
    void notifyApprovalEvent("审批执行超时", [
      `- 操作：${APPROVAL_POLICIES[request.policyKey as ApprovalPolicyKey]?.label ?? request.policyKey}`,
      `- 申请人：${request.requesterName || request.requesterEmail || request.requesterId}`,
      "- 审批已标记为执行失败，可由对应执行人重试",
    ]);
  }

  const expired = await prisma.adminApprovalRequest.findMany({
    where: {
      status: { in: ["PENDING", "APPROVED", "EXECUTION_FAILED"] },
      expiresAt: { lt: now },
    },
    take: 100,
    orderBy: { expiresAt: "asc" },
  });
  for (const request of expired) {
    const updated = await prisma.adminApprovalRequest.updateMany({
      where: {
        id: request.id,
        status: { in: ["PENDING", "APPROVED", "EXECUTION_FAILED"] },
      },
      data: { status: "EXPIRED", error: "审批已过期" },
    });
    if (updated.count === 0) continue;
    count += 1;
    await createAuditLog({
      action: "admin_approval_expired",
      targetType: "system",
      targetId: request.id,
      targetLabel: request.policyKey,
      detail: { approvalId: request.id, requesterId: request.requesterId },
      actorType: "SYSTEM",
    });
    void notifyApprovalEvent("审批申请已过期", [
      `- 操作：${APPROVAL_POLICIES[request.policyKey as ApprovalPolicyKey]?.label ?? request.policyKey}`,
      `- 申请人：${request.requesterName || request.requesterEmail || request.requesterId}`,
    ]);
  }
  return count;
}

export async function getApprovalCountsForAdmin(admin: AdminUser) {
  const isReviewer = admin.role === "owner" || hasAdminPermission(admin, "approvals:review");
  const now = new Date();
  const base = isReviewer ? {} : { requesterId: admin.id };
  const [pending, approvedAwaiting] = await Promise.all([
    prisma.adminApprovalRequest.count({
      where: { ...base, status: "PENDING", expiresAt: { gt: now } },
    }),
    prisma.adminApprovalRequest.count({
      where: {
        ...base,
        status: "APPROVED",
        executionMode: "REQUESTER",
        expiresAt: { gt: now },
      },
    }),
  ]);
  return { pending, approvedAwaiting };
}

export async function getOwnerApprovalOverview() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [pending, approvedAwaiting, recent, latestPending] = await Promise.all([
    prisma.adminApprovalRequest.count({
      where: { status: "PENDING", expiresAt: { gt: now } },
    }),
    prisma.adminApprovalRequest.count({
      where: { status: "APPROVED", executionMode: "REQUESTER", expiresAt: { gt: now } },
    }),
    prisma.adminApprovalRequest.groupBy({
      by: ["status"],
      where: { createdAt: { gte: last24h } },
      _count: { _all: true },
    }),
    prisma.adminApprovalRequest.findMany({
      where: { status: "PENDING", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  return {
    pending,
    approvedAwaiting,
    recent: recent.map((row) => ({ status: row.status, count: row._count._all })),
    latestPending: latestPending.map(approvalSummary),
  };
}
