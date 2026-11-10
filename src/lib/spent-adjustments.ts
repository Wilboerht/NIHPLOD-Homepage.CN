/**
 * 消费补录申请服务模块
 * 用户提交全渠道消费凭证（订单号/小票号 + 选填截图），管理员人工审核，
 * 通过后以核实金额累加历史消费（复用 applyExternalSpentSync），自动重算会员等级。
 * 支持撤销审核（按 reference 反向冲正，申请回到待审核队列可重新审核）。
 */
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import {
  applyExternalSpentSync,
  invalidateProfileCache,
  pushMembershipUpdateWebhook,
  SpentReversalExceedsBalanceError,
} from "@/lib/points";
import {
  normalizeOrderNo,
  releaseSpentOrderClaim,
  SpentOrderConflictError,
} from "@/lib/spent-order";
import { enqueueNotification } from "@/lib/notification-outbox";
import { SPENT_CHANNEL_LABELS, SPENT_STATUS_LABELS } from "@/lib/spent-adjustment-meta";
import { SPENT_REVIEW_CUMULATIVE_LIMITS } from "@/lib/admin-approval-policy";
import { getUtc8DayStart, getUtc8WeekStartMonday } from "@/lib/timezone";
import type { SpentAdjustmentStatus } from "@/generated/prisma/client";

// 供服务端路由引用的业务常量（定义见 spent-adjustment-meta，客户端安全）
export {
  MAX_PENDING_PER_USER,
  MAX_CLAIMED_AMOUNT,
  MAX_REVIEW_AMOUNT,
  MAX_IMAGES,
  MAX_ORDER_NO_LENGTH,
  MAX_DEALER_NAME_LENGTH,
  SPENT_CHANNEL_LABELS,
  SPENT_CHANNELS,
  LEGACY_SPENT_CHANNELS,
  ALL_SPENT_CHANNELS,
  SPENT_STATUS_LABELS,
  SPENT_SOURCE_LABELS,
} from "@/lib/spent-adjustment-meta";

export type ReviewDecision = "approve" | "reject";

export type ReviewResult =
  { ok: true; status: SpentAdjustmentStatus } | { ok: false; code: string; message: string };

/**
 * 生成审核入账的幂等 reference。
 * 带时间戳的周期唯一值：撤销后重新审核会生成新 reference，
 * 避免与历史 SpentSyncRecord 冲突（否则重审会命中幂等检查导致不重复入账）。
 */
function reviewReference(applicationId: string): string {
  return `manual:${applicationId}:${Date.now()}`;
}

class CumulativeApprovalRequiredError extends Error {
  readonly code = "CUMULATIVE_APPROVAL_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "CumulativeApprovalRequiredError";
  }
}

/**
 * 审核消费补录申请（管理员）
 *
 * 状态更新、订单占用、消费额、等级和积分流水在同一事务提交。
 * 提交结果未知时重试会读取已处理状态，不会重新生成入账周期。
 */
export async function reviewApplication(params: {
  applicationId: string;
  decision: ReviewDecision;
  adminId: string;
  reviewAmount?: number;
  reviewNote?: string;
  /** 仅 owner 可对自己代客提交的申请直接审核（四眼原则豁免） */
  allowSelfReview?: boolean;
  /** owner 审批执行器已通过审批，不再重复累计校验 */
  allowCumulativeOverride?: boolean;
}): Promise<ReviewResult> {
  const {
    applicationId,
    decision,
    adminId,
    reviewAmount,
    reviewNote,
    allowSelfReview,
    allowCumulativeOverride,
  } = params;
  const approved = decision === "approve";
  const now = new Date();
  const completedSync: Awaited<ReturnType<typeof applyExternalSpentSync>>[] = [];

  if (approved && (reviewAmount === undefined || reviewAmount <= 0)) {
    return { ok: false, code: "INVALID_PARAMS", message: "通过审核必须填写核实金额" };
  }

  // 0. 前置快照（含用户信息，用于入账与通知）
  const application = await prisma.spentAdjustmentApplication.findUnique({
    where: { id: applicationId },
    select: {
      status: true,
      userId: true,
      channel: true,
      orderNo: true,
      createdByAdminId: true,
      user: { select: { phone: true, status: true } },
    },
  });

  if (!application) {
    return { ok: false, code: "NOT_FOUND", message: "申请不存在" };
  }

  // 四眼原则：非 owner 不得审核自己代客提交的申请，避免自建自审虚增消费。
  if (application.createdByAdminId === adminId && !allowSelfReview) {
    return {
      ok: false,
      code: "SELF_REVIEW_FORBIDDEN",
      message: "不能审核自己提交的消费补录申请，请由其他管理员审核",
    };
  }

  if (application.status !== "PENDING") {
    return {
      ok: false,
      code: "ALREADY_REVIEWED",
      message: `该申请已处理（${SPENT_STATUS_LABELS[application.status]}），请勿重复审核`,
    };
  }

  // 用户已被冻结/封禁/注销时不允许通过入账；返回明确错误，避免拖到事务内
  // 抛异常后统一映射成 500（管理员可改为驳回，或先恢复用户状态）。
  if (approved && application.user.status !== "ACTIVE") {
    return {
      ok: false,
      code: "USER_INACTIVE",
      message: "用户当前状态不可入账，请驳回该申请或先恢复用户状态",
    };
  }

  // 仅通过审核需要订单入账冲突检查；驳回重复申请不应被已有入账阻塞。
  if (approved) {
    const imported = await prisma.spentImportRow.findFirst({
      where: {
        userId: application.userId,
        orderNo: { equals: application.orderNo, mode: "insensitive" },
        status: "SUCCESS",
        revertedAt: null,
      },
      select: { id: true },
    });
    if (imported) {
      return {
        ok: false,
        code: "ORDER_ALREADY_IMPORTED",
        message: "该订单号已通过 Excel 导入入账，请勿重复审核",
      };
    }
  }

  try {
    const claimed = await prisma.$transaction(async (tx) => {
      if (
        approved &&
        !allowCumulativeOverride &&
        typeof tx.$executeRaw === "function" &&
        typeof tx.spentAdjustmentApplication.aggregate === "function"
      ) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`spent-review-user:${application.userId}`}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`spent-review-reviewer:${adminId}`}))`;

        const dayStart = getUtc8DayStart(now);
        const weekStart = getUtc8WeekStartMonday(now);
        const amount = reviewAmount ?? 0;
        const [userDay, userWeek, reviewerDay] = await Promise.all([
          tx.spentAdjustmentApplication.aggregate({
            where: {
              userId: application.userId,
              status: "APPROVED",
              reviewedAt: { gte: dayStart },
            },
            _sum: { reviewAmount: true },
          }),
          tx.spentAdjustmentApplication.aggregate({
            where: {
              userId: application.userId,
              status: "APPROVED",
              reviewedAt: { gte: weekStart },
            },
            _sum: { reviewAmount: true },
          }),
          tx.spentAdjustmentApplication.aggregate({
            where: { reviewedById: adminId, status: "APPROVED", reviewedAt: { gte: dayStart } },
            _sum: { reviewAmount: true },
          }),
        ]);

        if (
          (userDay._sum.reviewAmount ?? 0) + amount > SPENT_REVIEW_CUMULATIVE_LIMITS.userDaily ||
          (userWeek._sum.reviewAmount ?? 0) + amount > SPENT_REVIEW_CUMULATIVE_LIMITS.userWeekly ||
          (reviewerDay._sum.reviewAmount ?? 0) + amount >
            SPENT_REVIEW_CUMULATIVE_LIMITS.reviewerDaily
        ) {
          throw new CumulativeApprovalRequiredError(
            "本次审核将超过累计审批上限，请提交 owner 审批"
          );
        }
      }

      const claim = await tx.spentAdjustmentApplication.updateMany({
        where: { id: applicationId, status: "PENDING" },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          reviewAmount: approved ? reviewAmount : null,
          reviewNote: reviewNote || null,
          reviewedById: adminId,
          reviewedAt: now,
        },
      });
      if (claim.count === 0) return false;

      if (approved) {
        const user = await tx.user.findUnique({
          where: { id: application.userId },
          select: { status: true },
        });
        if (!user || user.status !== "ACTIVE") throw new Error("SPENT_ADJUSTMENT_USER_UNAVAILABLE");
        const result = await applyExternalSpentSync(
          {
            userId: application.userId,
            spentDelta: reviewAmount as number,
            reference: reviewReference(applicationId),
            orderNo: application.orderNo,
            source: "SPENT_ADJUSTMENT",
            requireActiveUser: true,
            suppressWebhook: true,
            note: `消费补录：${SPENT_CHANNEL_LABELS[application.channel]} ${application.orderNo}`,
          },
          tx
        );
        if (!result) throw new Error("SPENT_ADJUSTMENT_USER_MISSING");
        completedSync.push(result);
      }
      return true;
    });

    if (!claimed) {
      return {
        ok: false,
        code: "ALREADY_REVIEWED",
        message: "该申请已被其他管理员处理，请刷新列表",
      };
    }

    const sync = completedSync[0];
    if (sync && !sync.duplicated && sync.appliedDelta !== 0) {
      invalidateProfileCache();
      pushMembershipUpdateWebhook(application.userId, sync).catch((error) =>
        apiConsole.warn(`[SpentAdjustment] 审核后会员 webhook 推送失败: ${error}`)
      );
    }

    await notifyReviewResult({
      applicationId,
      cycle: now.getTime(),
      userId: application.userId,
      phone: application.user.phone,
      orderNo: application.orderNo,
      status: approved ? "APPROVED" : "REJECTED",
      reviewAmount: approved ? reviewAmount : undefined,
      reviewNote: reviewNote || undefined,
    });

    return { ok: true, status: approved ? "APPROVED" : "REJECTED" };
  } catch (error) {
    if (error instanceof CumulativeApprovalRequiredError) {
      return { ok: false, code: error.code, message: error.message };
    }
    if (error instanceof SpentOrderConflictError) {
      return {
        ok: false,
        code: "ORDER_CONFLICT",
        message: "该订单号已在商城同步或 Excel 导入中入账，请勿重复审核",
      };
    }
    apiConsole.error("[SpentAdjustment] 审核异常，事务已回滚:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "服务器错误" };
  }
}

/**
 * 撤销审核（管理员）：仅已通过的申请可撤销。
 *
 * - CAS（status=APPROVED 条件更新）将申请恢复为 PENDING（清空审核字段）；
 * - 按原核实金额反向冲正（spentDelta 为负），reference 周期唯一且幂等；
 * - 状态、冲正和订单占用释放同事务，失败整体回滚。
 * - 撤销后重新审核会生成新 reference，不命中旧幂等记录。
 */
export async function undoApplication(params: {
  applicationId: string;
  adminId: string;
  reason: string;
}): Promise<ReviewResult> {
  const { applicationId, adminId, reason } = params;
  const completedSync: Awaited<ReturnType<typeof applyExternalSpentSync>>[] = [];

  try {
    const application = await prisma.spentAdjustmentApplication.findUnique({
      where: { id: applicationId },
      select: {
        status: true,
        userId: true,
        orderNo: true,
        reviewAmount: true,
        reviewNote: true,
        reviewedById: true,
        reviewedAt: true,
        user: { select: { status: true, phone: true } },
      },
    });

    if (!application) {
      return { ok: false, code: "NOT_FOUND", message: "申请不存在" };
    }

    if (application.status !== "APPROVED") {
      return {
        ok: false,
        code: "NOT_APPROVED",
        message: "仅已通过的申请可撤销审核",
      };
    }
    if (application.user?.status === "DELETED") {
      return {
        ok: false,
        code: "USER_DELETED",
        message: "用户已注销，不能撤销补录审核并回写积分/等级",
      };
    }

    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.spentAdjustmentApplication.updateMany({
        where: { id: applicationId, status: "APPROVED" },
        data: {
          status: "PENDING",
          lastReviewAmount: application.reviewAmount,
          lastReviewNote: application.reviewNote,
          lastReviewedById: application.reviewedById,
          lastReviewedAt: application.reviewedAt,
          undoReason: reason.trim(),
          undoneById: adminId,
          undoneAt: new Date(),
          reviewAmount: null,
          reviewNote: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });
      if (claim.count === 0) return false;

      const result = await applyExternalSpentSync(
        {
          userId: application.userId,
          spentDelta: -(application.reviewAmount ?? 0),
          reference: `manual-undo:${applicationId}:${Date.now()}`,
          allowNegativeClamp: false,
          suppressWebhook: true,
          note: `撤销消费补录审核：${applicationId}（管理员 ${adminId}）`,
        },
        tx
      );
      if (!result) throw new Error("SPENT_ADJUSTMENT_USER_MISSING");
      completedSync.push(result);

      await releaseSpentOrderClaim(tx, {
        userId: application.userId,
        orderNoKey: application.orderNo ? normalizeOrderNo(application.orderNo) : null,
        source: "SPENT_ADJUSTMENT",
        referencePrefix: `manual:${applicationId}:`,
      });
      return true;
    });

    if (!claimed) {
      return {
        ok: false,
        code: "ALREADY_REVIEWED",
        message: "该申请已被其他管理员处理，请刷新列表",
      };
    }

    const sync = completedSync[0];
    if (sync && !sync.duplicated && sync.appliedDelta !== 0) {
      invalidateProfileCache();
      pushMembershipUpdateWebhook(application.userId, sync).catch((error) =>
        apiConsole.warn(`[SpentAdjustment] 撤销后会员 webhook 推送失败: ${error}`)
      );
    }

    await notifyUndoResult({
      applicationId,
      cycle: Date.now(),
      userId: application.userId,
      phone: application.user.phone,
      orderNo: application.orderNo,
      reason: reason.trim(),
    });

    apiConsole.info(`[SpentAdjustment] 撤销审核完成：applicationId=${applicationId}`);
    return { ok: true, status: "PENDING" };
  } catch (error) {
    if (error instanceof SpentReversalExceedsBalanceError) {
      return {
        ok: false,
        code: "REVERSAL_EXCEEDS_BALANCE",
        message: "用户当前累计消费不足以完整冲正，已取消撤销；请核对退款/导入记录后人工处理",
      };
    }
    apiConsole.error("[SpentAdjustment] 撤销审核异常:", error);
    return { ok: false, code: "INTERNAL_ERROR", message: "服务器错误" };
  }
}

/**
 * 审核结果通知：短信 + 微信模板消息（均已绑定微信的用户生效）
 * 尽力而为：任一渠道失败不影响其它渠道与审核主流程。
 */
async function notifyReviewResult(params: {
  applicationId: string;
  cycle: number;
  userId: string;
  phone: string;
  orderNo: string;
  status: "APPROVED" | "REJECTED";
  reviewAmount?: number;
  reviewNote?: string;
}): Promise<void> {
  const { applicationId, cycle, userId, phone, orderNo, status, reviewAmount, reviewNote } = params;
  const payload = {
    status,
    orderNo,
    ...(reviewAmount !== undefined ? { reviewAmount } : {}),
    ...(reviewNote ? { reviewNote } : {}),
    statusLabel: status === "APPROVED" ? "审核通过" : "审核未通过",
  };
  const baseKey = `spent-review:${applicationId}:${cycle}:${status}`;
  await Promise.all([
    enqueueNotification({
      idempotencyKey: `${baseKey}:sms`,
      channel: "SMS",
      eventType: "spent_review_result",
      templateKey: "spent_review_result",
      userId,
      recipient: { phone },
      payload,
      aggregateType: "spent_adjustment",
      aggregateId: orderNo,
    }),
    enqueueNotification({
      idempotencyKey: `${baseKey}:wechat`,
      channel: "WECHAT_TEMPLATE",
      eventType: "spent_review_result",
      templateKey: "spent_review_result",
      userId,
      recipient: { userId },
      payload,
      aggregateType: "spent_adjustment",
      aggregateId: orderNo,
    }),
    enqueueNotification({
      idempotencyKey: `${baseKey}:mp`,
      channel: "MINIPROGRAM",
      eventType: "spent_review_result",
      templateKey: "spent_review_result",
      userId,
      recipient: { userId },
      payload,
      aggregateType: "spent_adjustment",
      aggregateId: orderNo,
    }),
  ]).catch((error) => apiConsole.error("[SpentAdjustment] 通知入队失败:", error));
}

async function notifyUndoResult(params: {
  applicationId: string;
  cycle: number;
  userId: string;
  phone: string;
  orderNo: string;
  reason: string;
}): Promise<void> {
  const baseKey = `spent-undo:${params.applicationId}:${params.cycle}`;
  const payload = {
    status: "UNDONE",
    orderNo: params.orderNo,
    reviewNote: params.reason,
    statusLabel: "审核已撤销，等待重新审核",
  };
  await Promise.all([
    enqueueNotification({
      idempotencyKey: `${baseKey}:sms`,
      channel: "SMS",
      eventType: "spent_review_undo",
      templateKey: "spent_review_undo",
      userId: params.userId,
      recipient: { phone: params.phone },
      payload,
      aggregateType: "spent_adjustment",
      aggregateId: params.applicationId,
    }),
    enqueueNotification({
      idempotencyKey: `${baseKey}:wechat`,
      channel: "WECHAT_TEMPLATE",
      eventType: "spent_review_undo",
      templateKey: "spent_review_undo",
      userId: params.userId,
      recipient: { userId: params.userId },
      payload,
      aggregateType: "spent_adjustment",
      aggregateId: params.applicationId,
    }),
    enqueueNotification({
      idempotencyKey: `${baseKey}:mp`,
      channel: "MINIPROGRAM",
      eventType: "spent_review_undo",
      templateKey: "spent_review_undo",
      userId: params.userId,
      recipient: { userId: params.userId },
      payload,
      aggregateType: "spent_adjustment",
      aggregateId: params.applicationId,
    }),
  ]).catch((error) => apiConsole.error("[SpentAdjustment] 撤销通知入队失败:", error));
}
