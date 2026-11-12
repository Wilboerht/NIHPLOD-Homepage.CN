import { createHash, randomUUID } from "crypto";
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
  isRedemptionRefundApprovalRequired,
  isSpentReviewApprovalRequired,
  type ApprovalPolicy,
  type ApprovalPolicyKey,
} from "./admin-approval-policy";
import { executeApprovalPolicy, type ApprovalExecutorResult } from "./admin-approval-executors";
import { verifyImportPreviewToken } from "./spent-import";
import { AccountSecurityError, getPhoneChangePreflight } from "./admin-account-security";
import { getAccountMergePreflight } from "./admin-account-merge";

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const EXECUTING_TIMEOUT_MS = 30 * 60 * 1000;
const EXECUTING_HEARTBEAT_MS = 60 * 1000;

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
  requester: Pick<AdminUser, "id" | "role">
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
    case "redemption.refund": {
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
      if (redemption.status !== "RETURNED") {
        throw new AdminApprovalError("TARGET_NOT_REFUNDABLE", "兑换记录不在待退款状态", 409);
      }
      return {
        targetType: "point_redemption",
        targetId: redemption.id,
        targetLabel: `${redemption.productName} · ${userLabel(redemption.user)}`,
        targetSnapshot: { status: redemption.status, points: redemption.points },
        approvalRequired: isRedemptionRefundApprovalRequired(redemption.points),
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
          isSpentReviewApprovalRequired(Number(payload.reviewAmount), application.amountClaimed),
      };
    }
    case "spent.import.execute": {
      const previewToken = String(payload.previewToken);
      const verified = verifyImportPreviewToken(previewToken, requester.id);
      if (!verified.ok) {
        throw new AdminApprovalError(
          verified.code,
          verified.message,
          verified.code === "TOKEN_EXPIRED" ? 410 : 400
        );
      }
      return {
        targetType: "spent_import",
        targetId: null,
        targetLabel: verified.payload.fileName,
        targetSnapshot: {
          fileHash: verified.payload.fileHash,
          rowCount: verified.payload.rows.length,
          previewExpiresAt: new Date(verified.payload.exp).toISOString(),
        },
        approvalRequired: true,
      };
    }
    case "spent.import.undo": {
      const batchId = String(payload.batchId);
      const batch = await prisma.spentImportBatch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          fileName: true,
          status: true,
          undoneAt: true,
          totalRows: true,
          successRows: true,
          totalAmount: true,
        },
      });
      if (!batch) {
        throw new AdminApprovalError("TARGET_NOT_FOUND", "导入批次不存在", 404);
      }
      if (batch.undoneAt) {
        throw new AdminApprovalError("ALREADY_UNDONE", "该批次已撤销", 409);
      }
      if (batch.status === "PROCESSING") {
        throw new AdminApprovalError("TARGET_NOT_COMPLETED", "该批次仍在处理中，暂不可撤销", 409);
      }
      return {
        targetType: "spent_import",
        targetId: batch.id,
        targetLabel: batch.fileName,
        targetSnapshot: {
          status: batch.status,
          totalRows: batch.totalRows,
          successRows: batch.successRows,
          totalAmount: batch.totalAmount,
        },
        approvalRequired: true,
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
      if (target.id === requester.id) {
        throw new AdminApprovalError("SELF_DELETE", "不能申请删除自己的账号", 400);
      }
      if (requester.role !== "owner" && target.role === "owner") {
        throw new AdminApprovalError(
          "FORBIDDEN",
          "非 super admin 不能发起删除 super admin 账号的申请",
          403
        );
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
    case "user.phone.change": {
      try {
        const preflight = await getPhoneChangePreflight(
          String(payload.userId),
          String(payload.newPhone)
        );
        if (preflight.currentPhoneHash !== String(payload.expectedPhoneHash)) {
          throw new AdminApprovalError("STALE", "手机号快照不一致，请重新预检", 409);
        }
        if (!preflight.available) {
          throw new AdminApprovalError(
            "PHONE_OCCUPIED",
            "新手机号已绑定其他账户，请先处理账户合并或原账户换绑",
            409
          );
        }
        return {
          targetType: "user",
          targetId: preflight.userId,
          targetLabel: preflight.currentPhone,
          targetSnapshot: {
            status: preflight.status,
            phoneHash: preflight.currentPhoneHash,
            newPhone: preflight.newPhone,
          },
          approvalRequired: true,
        };
      } catch (error) {
        if (error instanceof AccountSecurityError) {
          throw new AdminApprovalError(error.code, error.message, error.status);
        }
        throw error;
      }
    }
    case "user.accounts.merge": {
      try {
        const preflight = await getAccountMergePreflight(
          String(payload.sourceUserId),
          String(payload.targetUserId)
        );
        if (
          preflight.source.updatedAt !== String(payload.expectedSourceUpdatedAt) ||
          preflight.target.updatedAt !== String(payload.expectedTargetUpdatedAt)
        ) {
          throw new AdminApprovalError("STALE", "账户快照不一致，请重新预检", 409);
        }
        if (!preflight.canMerge) {
          throw new AdminApprovalError(
            "MERGE_CONFLICT",
            preflight.conflicts[0]?.message || "账户存在合并冲突",
            409
          );
        }
        return {
          targetType: "user",
          targetId: preflight.target.id,
          targetLabel: `${preflight.source.nickname || preflight.source.phone} → ${preflight.target.nickname || preflight.target.phone}`,
          targetSnapshot: {
            sourceUserId: preflight.source.id,
            sourceStatus: preflight.source.status,
            targetStatus: preflight.target.status,
            sourceUpdatedAt: preflight.source.updatedAt,
            targetUpdatedAt: preflight.target.updatedAt,
            pointsAfter: preflight.preview.pointsAfter,
            totalSpentAfter: preflight.preview.spentAfter,
          },
          approvalRequired: true,
        };
      } catch (error) {
        if (error instanceof AccountSecurityError) {
          throw new AdminApprovalError(error.code, error.message, error.status);
        }
        throw error;
      }
    }
    case "totp.recovery.issue": {
      const adminId = String(payload.adminId);
      const target = await prisma.admin.findUnique({
        where: { id: adminId, deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          totpEnabled: true,
          totpResetRequired: true,
        },
      });
      if (!target) throw new AdminApprovalError("TARGET_NOT_FOUND", "管理员不存在", 404);
      if (target.status !== "ACTIVE") {
        throw new AdminApprovalError("TARGET_INACTIVE", "目标管理员不可用", 400);
      }
      if (target.id === requester.id) {
        throw new AdminApprovalError("SELF_RECOVERY_FORBIDDEN", "不能为自己申请恢复码", 400);
      }
      if (requester.role !== "owner" && target.role === "owner") {
        throw new AdminApprovalError(
          "FORBIDDEN",
          "非 super admin 不能发起针对 super admin 的恢复码申请",
          403
        );
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

function summarizeApprovalPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const clone = { ...(payload as Record<string, unknown>) };
  // 导入预览令牌最大 2MB：列表/审批响应只返回占位，详情接口按需返回完整值。
  if (typeof clone.previewToken === "string") {
    clone.previewToken = "[已在列表隐藏，请打开详情查看]";
  }
  return clone;
}

type ApprovalSummarySource = Omit<AdminApprovalRequest, "payload"> & {
  payload?: AdminApprovalRequest["payload"] | null;
};

function approvalSummary(request: ApprovalSummarySource) {
  return {
    id: request.id,
    policyKey: request.policyKey,
    action: request.action,
    executionMode: request.executionMode,
    targetType: request.targetType,
    targetId: request.targetId,
    targetLabel: request.targetLabel,
    targetSnapshot: request.targetSnapshot,
    payload: request.payload ? summarizeApprovalPayload(request.payload) : null,
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
  const ownerRequestablePolicies = new Set(["totp.recovery.issue", "admin.delete"]);
  if (input.admin.role === "owner" && !ownerRequestablePolicies.has(policy.key)) {
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
  const target = await resolveApprovalTarget(policy, payload, input.admin);

  // 单人审批下，owner 需要看到“申请人是否原本就能执行该动作”。
  // 管理面操作已在 requestPermission 收紧；业务面操作保留读权限发起，
  // 但把权限快照写入 targetSnapshot 供审批页显式提示。
  const requesterPermissionSnapshot = {
    role: input.admin.role,
    requestPermission: policy.requestPermission,
    actionPermission: policy.actionPermission,
    hadActionPermission: hasAdminPermission(input.admin, policy.actionPermission),
  };
  const targetSnapshot = {
    ...target.targetSnapshot,
    requesterPermission: requesterPermissionSnapshot,
  };

  if (!target.approvalRequired) {
    throw new AdminApprovalError("APPROVAL_NOT_REQUIRED", "该操作未达到审批条件，可直接执行", 400);
  }

  const reason = input.reason.trim();
  if (reason.length < 5) {
    throw new AdminApprovalError("INVALID_REASON", "请填写至少 5 个字符的申请原因", 400);
  }

  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
  const payloadHash = hashPayload(payload);
  // 去重必须覆盖“所有申请人”，且必须与创建在同一把 advisory lock 内完成：
  // 否则两名管理员（或同一管理员并发双击）可以各创建一条相同申请，
  // owner 分别批准后资金类操作（尤其是积分调整）会被执行两次。
  const dedupeKey = `${policy.key}:${target.targetId ?? ""}:${payloadHash}`;
  const request = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`approval-create:${dedupeKey}`}))`;

    const duplicate = await tx.adminApprovalRequest.findFirst({
      where: {
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

    // 积分调整额外按“目标 + 金额”聚合去重：备注不同会改变 payloadHash，
    // 仅靠上面的 hash 去重仍可拆成两笔先后执行，导致重复加/扣分。
    if (policy.key === "points.adjust" && target.targetId) {
      const amount = (payload as { amount?: unknown }).amount;
      if (typeof amount === "number") {
        // 不同备注会改变 payloadHash，因此必须再按「目标 + 金额」加锁，
        // 否则两个并发申请会各自跳过下面的活跃申请检查并重复创建。
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`approval-points:${target.targetId}:${amount}`}))`;
        const active =
          (await tx.adminApprovalRequest.findMany({
            where: {
              policyKey: policy.key,
              targetId: target.targetId,
              status: { in: ["PENDING", "APPROVED", "EXECUTING", "EXECUTION_FAILED"] },
              expiresAt: { gt: new Date() },
            },
            select: { payload: true, status: true },
          })) ?? [];
        const conflict = active.find(
          (item) =>
            typeof (item.payload as { amount?: unknown })?.amount === "number" &&
            (item.payload as { amount: number }).amount === amount
        );
        if (conflict) {
          throw new AdminApprovalError(
            "DUPLICATE_REQUEST",
            "该用户已有相同金额的待处理积分调整申请",
            409
          );
        }
      }
    }

    return tx.adminApprovalRequest.create({
      data: {
        policyKey: policy.key,
        action: policy.action,
        executionMode: policy.executionMode,
        targetType: target.targetType,
        targetId: target.targetId,
        targetLabel: target.targetLabel,
        targetSnapshot: toInputJson(targetSnapshot),
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
      requesterPermission: requesterPermissionSnapshot,
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
      // 列表不读取完整 payload：spent.import.execute 的 previewToken 最大 2MB。
      omit: { payload: true },
    }),
    prisma.adminApprovalRequest.count({ where }),
  ]);

  // 非导入类审批的 payload 很小，按需补齐；导入类只返回占位，详情接口再读完整值。
  const lightweightIds = items
    .filter((item) => item.policyKey !== "spent.import.execute")
    .map((item) => item.id);
  const payloadRows =
    lightweightIds.length > 0
      ? await prisma.adminApprovalRequest.findMany({
          where: { id: { in: lightweightIds } },
          select: { id: true, payload: true },
        })
      : [];
  const payloadById = new Map(payloadRows.map((row) => [row.id, row.payload]));

  return {
    items: items.map((item) =>
      approvalSummary({
        ...item,
        payload:
          item.policyKey === "spent.import.execute"
            ? { previewToken: "[已在列表隐藏，请打开详情查看]" }
            : (payloadById.get(item.id) ?? null),
      })
    ),
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
    reason: request.reason,
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

  // 执行前重新校验审批人：必须仍是有效 owner。
  // 避免审批后被降级/停用/删除的账号继续触发资金或权限操作。
  const approver = await prisma.admin.findFirst({
    where: { id: request.approverId, role: "owner", status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!approver) {
    throw new AdminApprovalError("APPROVER_INACTIVE", "审批人已失效，请重新发起审批", 409);
  }

  if (request.payloadHash !== hashPayload(request.payload as Record<string, unknown>)) {
    throw new AdminApprovalError("PAYLOAD_CHANGED", "申请参数已变化，请重新发起", 409);
  }

  const leaseToken = randomUUID();
  const claimed = await prisma.adminApprovalRequest.updateMany({
    where: { id: request.id, status: fromStatus },
    data: {
      status: "EXECUTING",
      error: null,
      leaseToken,
      heartbeatAt: new Date(),
      ...(fromStatus === "EXECUTION_FAILED" ? { executedAt: null } : {}),
    },
  });
  if (claimed.count === 0) {
    throw new AdminApprovalError("INVALID_STATUS", "审批申请已被处理", 409);
  }
  if (options.onClaimed) {
    await options.onClaimed(request);
  }

  // 心跳续租：长耗时执行（导入、批量删除等）不会被超时补偿任务误判。
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const touchHeartbeat = async () => {
    try {
      await prisma.adminApprovalRequest.updateMany({
        where: { id: request.id, status: "EXECUTING", leaseToken },
        data: { heartbeatAt: new Date() },
      });
    } catch (error) {
      apiConsole.warn("[AdminApproval] 执行心跳更新失败:", error);
    }
  };
  heartbeatTimer = setInterval(() => {
    void touchHeartbeat();
  }, EXECUTING_HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  try {
    const result: ApprovalExecutorResult = await executeApprovalPolicy(executorContext(request));
    const resultMeta = result.resultMeta ?? {};
    const completed = await prisma.adminApprovalRequest.updateMany({
      where: { id: request.id, status: "EXECUTING", leaseToken },
      data: {
        status: "EXECUTED",
        executionResult: toInputJson(resultMeta),
        executedAt: new Date(),
        error: null,
        leaseToken: null,
        heartbeatAt: null,
      },
    });
    if (completed.count === 0) {
      // 业务副作用可能已完成，但租约已被超时任务回收：不能谎报成功。
      await createAuditLog({
        action: "admin_approval_result_unknown",
        targetType: "system",
        targetId: request.id,
        targetLabel: request.policyKey,
        detail: {
          approvalId: request.id,
          requesterId: request.requesterId,
          approverId: request.approverId,
          reason: "lease_lost_after_execution",
          resultMeta,
        },
        actorType: "SYSTEM",
      });
      return {
        ok: false,
        status: "EXECUTION_FAILED",
        error: "执行结果未知（执行租约丢失），请核查业务结果后再决定是否重试",
      };
    }
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
    const failed = await prisma.adminApprovalRequest.updateMany({
      where: { id: request.id, status: "EXECUTING", leaseToken },
      data: {
        status: isStale ? "STALE" : "EXECUTION_FAILED",
        error: message,
        executedAt: new Date(),
        leaseToken: null,
        heartbeatAt: null,
      },
    });
    if (failed.count === 0) {
      await createAuditLog({
        action: "admin_approval_result_unknown",
        targetType: "system",
        targetId: request.id,
        targetLabel: request.policyKey,
        detail: {
          approvalId: request.id,
          requesterId: request.requesterId,
          approverId: request.approverId,
          reason: "lease_lost_after_error",
          error: message,
        },
        actorType: "SYSTEM",
      });
      return {
        ok: false,
        status: "EXECUTION_FAILED",
        error: "执行结果未知（执行租约丢失），请核查业务结果后再决定是否重试",
      };
    }
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
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
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
  if (
    request.targetId === input.admin.id &&
    (request.policyKey === "admin.delete" || request.policyKey === "totp.recovery.issue")
  ) {
    throw new AdminApprovalError("SELF_APPROVAL_FORBIDDEN", "不能重试针对自己的高风险申请", 400);
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
    if (!hasAdminPermission(input.admin, policy.actionPermission)) {
      throw new AdminApprovalError("FORBIDDEN", "审批对应的执行权限已失效", 403);
    }
  }

  // 先完成 TOTP 校验，再产生改派副作用；避免验证失败却已改写审批人。
  const verifiedAt = await verifyFreshTotp(input.admin, input.totpCode);

  // 原审批人离职/降级后，EXECUTION_FAILED 申请不能永久卡死：
  // 允许当前 owner 以新的 TOTP 审批动作接管执行（仅 AUTO 模式）。
  if (request.executionMode === "AUTO") {
    const approverActive = await prisma.admin.findFirst({
      where: {
        id: request.approverId ?? "",
        role: "owner",
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!approverActive) {
      await prisma.adminApprovalRequest.updateMany({
        where: { id: request.id, status: "EXECUTION_FAILED" },
        data: {
          approverId: input.admin.id,
          approverEmail: input.admin.email,
          approverName: input.admin.name,
          approvedAt: new Date(),
          decisionNote: request.decisionNote
            ? `${request.decisionNote}（原审批人失效，由 ${input.admin.name} 接管重试）`
            : `原审批人失效，由 ${input.admin.name} 接管重试`,
        },
      });
      await createAuditLog({
        action: "admin_approval_reassigned",
        targetType: "system",
        targetId: request.id,
        targetLabel: request.policyKey,
        detail: {
          approvalId: request.id,
          previousApproverId: request.approverId,
          newApproverId: input.admin.id,
        },
        actorType: "ADMIN",
        actorEmail: input.admin.email,
        actorName: input.admin.name,
        actorRole: input.admin.role,
        authMethod: "totp",
        adminId: input.admin.id,
      }).catch((error) => apiConsole.warn("[AdminApproval] 改派审计写入失败:", error));
    }
  }

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
  if (request.requesterId === input.admin.id) {
    throw new AdminApprovalError("SELF_APPROVAL_FORBIDDEN", "不能批准自己发起的申请", 400);
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
  if (request.expiresAt.getTime() <= Date.now()) {
    await markExpired(request);
    throw new AdminApprovalError("EXPIRED", "审批申请已过期", 409);
  }
  if (request.requesterId === input.admin.id) {
    throw new AdminApprovalError("SELF_APPROVAL_FORBIDDEN", "不能处理自己发起的申请", 400);
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
  if (!hasAdminPermission(admin, policy.actionPermission)) {
    throw new AdminApprovalError("FORBIDDEN", "审批对应的执行权限已失效", 403);
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

/**
 * 补偿“审批已通过但执行前进程崩溃”的 AUTO 申请：
 * owner 批准时先写 APPROVED，再调用执行器；若进程在两步之间退出，
 * 申请会永久停在 APPROVED（retry 只接受 EXECUTION_FAILED）。
 * 定时任务扫描停留超过 1 分钟的 APPROVED AUTO 申请并重新执行。
 */
export async function reconcileStaleApprovedApprovals(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - 60 * 1000);
  const stale = await prisma.adminApprovalRequest.findMany({
    where: {
      status: "APPROVED",
      executionMode: "AUTO",
      approvedAt: { lt: staleBefore },
      expiresAt: { gt: now },
    },
    select: { id: true },
    orderBy: { approvedAt: "asc" },
    take: 20,
  });

  let executed = 0;
  for (const request of stale) {
    try {
      const outcome = await executeApprovedRequest(request.id);
      if (outcome.ok) executed += 1;
    } catch (error) {
      // 并发下可能已被其他任务/请求执行；记录后继续处理下一条
      const message = error instanceof Error ? error.message : String(error);
      apiConsole.warn(
        "[AdminApproval] 补偿执行 APPROVED 申请失败:",
        request.id,
        error instanceof Error ? error.message : error
      );
      void notifyApprovalEvent("审批补偿执行失败", [
        `- 审批单：${request.id}`,
        `- 错误：${message}`,
      ]);
    }
  }
  return executed;
}

export async function expirePendingApprovals(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - EXECUTING_TIMEOUT_MS);
  const staleExecuting = await prisma.adminApprovalRequest.findMany({
    where: {
      status: "EXECUTING",
      OR: [
        { heartbeatAt: { lt: staleBefore } },
        { heartbeatAt: null, updatedAt: { lt: staleBefore } },
      ],
    },
    take: 100,
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      policyKey: true,
      requesterId: true,
      requesterEmail: true,
      requesterName: true,
      approverId: true,
      leaseToken: true,
    },
  });
  let count = 0;
  for (const request of staleExecuting) {
    const updated = await prisma.adminApprovalRequest.updateMany({
      where: {
        id: request.id,
        status: "EXECUTING",
        leaseToken: request.leaseToken,
        OR: [
          { heartbeatAt: { lt: staleBefore } },
          { heartbeatAt: null, updatedAt: { lt: staleBefore } },
        ],
      },
      data: {
        status: "EXECUTION_FAILED",
        error: "执行超时，请重试",
        executedAt: now,
        leaseToken: null,
        heartbeatAt: null,
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
    select: {
      id: true,
      policyKey: true,
      requesterId: true,
      requesterEmail: true,
      requesterName: true,
    },
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
