/**
 * 消费补录申请服务模块
 * 用户提交全渠道消费凭证（订单号/小票号 + 选填截图），管理员人工审核，
 * 通过后以核实金额累加历史消费（复用 applyExternalSpentSync），自动重算会员等级。
 * 支持撤销审核（按 reference 反向冲正，申请回到待审核队列可重新审核）。
 */
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { applyExternalSpentSync, SpentReversalExceedsBalanceError } from "@/lib/points";
import {
  normalizeOrderNo,
  releaseSpentOrderClaim,
  SpentOrderConflictError,
} from "@/lib/spent-order";
import { sendSpentReviewNotification } from "@/lib/sms";
import { sendSpentAdjustmentReviewMessage } from "@/lib/wechat-template";
import { notifyPointsSpentReview } from "@/lib/miniprogram-notify";
import { after } from "next/server";
import { SPENT_CHANNEL_LABELS, SPENT_STATUS_LABELS } from "@/lib/spent-adjustment-meta";
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
}): Promise<ReviewResult> {
  const { applicationId, decision, adminId, reviewAmount, reviewNote } = params;
  const approved = decision === "approve";
  const now = new Date();

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
      user: { select: { phone: true, status: true } },
    },
  });

  if (!application) {
    return { ok: false, code: "NOT_FOUND", message: "申请不存在" };
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

  // 跨来源去重：同一用户的同一订单号若已通过 Excel 导入成功入账且未撤销，
  // 不允许再通过补录审核重复入账（导入侧执行时也会反向检查已通过的补录）。
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
      message: "该订单号已通过 Excel 导入入账；请先撤销对应导入批次，再审核此申请",
    };
  }

  try {
    const claimed = await prisma.$transaction(async (tx) => {
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
            note: `消费补录：${SPENT_CHANNEL_LABELS[application.channel]} ${application.orderNo}`,
          },
          tx
        );
        if (!result) throw new Error("SPENT_ADJUSTMENT_USER_MISSING");
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

    notifyReviewResult({
      userId: application.userId,
      phone: application.user.phone,
      orderNo: application.orderNo,
      status: approved ? "APPROVED" : "REJECTED",
      reviewAmount: approved ? reviewAmount : undefined,
      reviewNote: reviewNote || undefined,
    });

    return { ok: true, status: approved ? "APPROVED" : "REJECTED" };
  } catch (error) {
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
}): Promise<ReviewResult> {
  const { applicationId, adminId } = params;

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

    const claimed = await prisma.$transaction(async (tx) => {
      const claim = await tx.spentAdjustmentApplication.updateMany({
        where: { id: applicationId, status: "APPROVED" },
        data: {
          status: "PENDING",
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
          note: `撤销消费补录审核：${applicationId}（管理员 ${adminId}）`,
        },
        tx
      );
      if (!result) throw new Error("SPENT_ADJUSTMENT_USER_MISSING");

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
function notifyReviewResult(params: {
  userId: string;
  phone: string;
  orderNo: string;
  status: "APPROVED" | "REJECTED";
  reviewAmount?: number;
  reviewNote?: string;
}): void {
  const { userId, phone, orderNo, status, reviewAmount, reviewNote } = params;
  const fire = () => {
    void sendSpentReviewNotification(phone, status === "APPROVED" ? "已通过" : "未通过").catch(
      (e) => apiConsole.error("[SpentAdjustment] 短信通知异常:", e)
    );
    void sendSpentAdjustmentReviewMessage({
      userId,
      status,
      orderNo,
      reviewAmount,
      reviewNote,
    }).catch((e) => apiConsole.error("[SpentAdjustment] 微信通知异常:", e));
    // 积分小程序订阅消息（用户已订阅模板时送达；未订阅/未配置时在内部静默跳过）
    void notifyPointsSpentReview({ userId, status });
  };
  try {
    after(fire);
  } catch {
    // 非请求上下文（测试等）：直接 fire-and-forget
    fire();
  }
}
