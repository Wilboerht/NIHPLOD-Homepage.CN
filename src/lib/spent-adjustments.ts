/**
 * 消费补录申请服务模块
 * 用户提交全渠道消费凭证（订单号/小票号 + 选填截图），管理员人工审核，
 * 通过后以核实金额累加历史消费（复用 applyExternalSpentSync），自动重算会员等级。
 * 支持撤销审核（按 reference 反向冲正，申请回到待审核队列可重新审核）。
 */
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { applyExternalSpentSync } from "@/lib/points";
import { sendSpentReviewNotification } from "@/lib/sms";
import { sendSpentAdjustmentReviewMessage } from "@/lib/wechat-template";
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
  SPENT_CHANNEL_LABELS,
  SPENT_CHANNELS,
  SPENT_STATUS_LABELS,
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
 * 补偿回滚：将申请从目标状态恢复为 PENDING（清空审核字段）。
 * 尽力而为，自身失败只记日志——极端情况下申请可能停留在已审核状态，
 * 此时可借助撤销审核功能人工修复。
 */
async function compensateClaim(
  applicationId: string,
  fromStatus: SpentAdjustmentStatus,
  restoreFields?: {
    status?: SpentAdjustmentStatus;
    reviewAmount: number | null;
    reviewNote: string | null;
    reviewedById: string | null;
    reviewedAt: Date | null;
  }
): Promise<void> {
  try {
    await prisma.spentAdjustmentApplication.updateMany({
      where: { id: applicationId, status: fromStatus },
      data: restoreFields ?? {
        status: "PENDING",
        reviewAmount: null,
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });
  } catch (error) {
    apiConsole.error(
      `[SpentAdjustment] 补偿回滚失败（applicationId=${applicationId}），请人工介入或使用撤销审核修复:`,
      error
    );
  }
}

/**
 * 审核消费补录申请（管理员）
 *
 * 并发安全：
 * - 先读快照做前置校验，再用 CAS（status=PENDING 条件更新）抢占审核权，
 *   只有一个管理员能抢到；抢占失败按已处理返回。
 * - 通过时入账复用 applyExternalSpentSync（reference 周期唯一、幂等），
 *   入账异常则补偿回滚申请状态为 PENDING，允许重试。
 * - 抢占成功后的任何未知异常同样触发补偿，避免申请卡在已审核但未入账的状态。
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
      user: { select: { phone: true } },
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

  // 1. CAS 抢占：仅 PENDING 状态可被审核
  try {
    const claim = await prisma.spentAdjustmentApplication.updateMany({
      where: { id: applicationId, status: "PENDING" },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        reviewAmount: approved ? reviewAmount : null,
        reviewNote: reviewNote || null,
        reviewedById: adminId,
        reviewedAt: now,
      },
    });

    if (claim.count === 0) {
      return {
        ok: false,
        code: "ALREADY_REVIEWED",
        message: "该申请已被其他管理员处理，请刷新列表",
      };
    }

    // 2. 通过：入账（幂等），失败则补偿回滚
    if (approved) {
      try {
        await applyExternalSpentSync({
          userId: application.userId,
          spentDelta: reviewAmount as number,
          reference: reviewReference(applicationId),
          note: `消费补录：${SPENT_CHANNEL_LABELS[application.channel]} ${application.orderNo}`,
        });
      } catch (error) {
        apiConsole.error("[SpentAdjustment] 入账失败，回滚申请状态:", error);
        await compensateClaim(applicationId, "APPROVED");
        return { ok: false, code: "INTERNAL_ERROR", message: "入账失败，请稍后重试" };
      }
    }

    // 3. 通知（fire-and-forget，不阻断审核主流程）
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
    // 抢占成功后的未知异常：补偿回滚，避免卡在已审核但未入账的状态
    apiConsole.error("[SpentAdjustment] 审核异常:", error);
    await compensateClaim(applicationId, approved ? "APPROVED" : "REJECTED");
    return { ok: false, code: "INTERNAL_ERROR", message: "服务器错误" };
  }
}

/**
 * 撤销审核（管理员）：仅已通过的申请可撤销。
 *
 * - CAS（status=APPROVED 条件更新）将申请恢复为 PENDING（清空审核字段）；
 * - 按原核实金额反向冲正（spentDelta 为负），reference 周期唯一且幂等；
 * - 冲正失败则补偿恢复为 APPROVED（保留原审核字段）。
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

    const original = {
      reviewAmount: application.reviewAmount,
      reviewNote: application.reviewNote,
      reviewedById: application.reviewedById,
      reviewedAt: application.reviewedAt,
    };

    // 1. CAS 抢占：仅 APPROVED 可撤销
    const claim = await prisma.spentAdjustmentApplication.updateMany({
      where: { id: applicationId, status: "APPROVED" },
      data: {
        status: "PENDING",
        reviewAmount: null,
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });

    if (claim.count === 0) {
      return {
        ok: false,
        code: "ALREADY_REVIEWED",
        message: "该申请已被其他管理员处理，请刷新列表",
      };
    }

    // 2. 反向冲正（幂等）
    try {
      await applyExternalSpentSync({
        userId: application.userId,
        spentDelta: -(application.reviewAmount ?? 0),
        reference: `manual-undo:${applicationId}:${Date.now()}`,
        note: `撤销消费补录审核：${applicationId}（管理员 ${adminId}）`,
      });
    } catch (error) {
      apiConsole.error("[SpentAdjustment] 撤销冲正失败，恢复审核状态:", error);
      await compensateClaim(applicationId, "PENDING", {
        status: "APPROVED",
        ...original,
      });
      return { ok: false, code: "INTERNAL_ERROR", message: "撤销失败，请稍后重试" };
    }

    apiConsole.info(`[SpentAdjustment] 撤销审核完成：applicationId=${applicationId}`);
    return { ok: true, status: "PENDING" };
  } catch (error) {
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
  };
  try {
    after(fire);
  } catch {
    // 非请求上下文（测试等）：直接 fire-and-forget
    fire();
  }
}
