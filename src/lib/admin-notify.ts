/**
 * 管理端企业微信业务通知：新积分申请（消费补录）与积分兑换申请。
 *
 * 在响应返回后通过 after() 异步发送，失败只记录日志，不影响用户提交结果。
 * 用户标识沿用审批通知口径：昵称优先，否则脱敏手机号。
 */
import { after } from "next/server";
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import { maskPhone } from "./mask-phone";
import { levelDisplay } from "./membership";
import { SPENT_CHANNEL_LABELS } from "./spent-adjustment-meta";
import {
  formatRedemptionToWecom,
  formatSpentApplicationToWecom,
  sendWecomNotification,
} from "./wecom";

function notifyAfterResponse(task: () => Promise<void>): void {
  const run = () => {
    void task().catch((error) => apiConsole.warn("[AdminNotify] 企业微信通知异常:", error));
  };
  try {
    after(run);
  } catch {
    // 非请求上下文（测试等）：直接 fire-and-forget
    run();
  }
}

async function send(content: string, type: "points" | "redemption"): Promise<void> {
  const result = await sendWecomNotification(content, type);
  if (!result.success) {
    apiConsole.warn(`[AdminNotify] 企业微信通知未发送: ${result.error ?? "unknown"}`);
  }
}

export function notifyNewSpentApplication(applicationId: string): void {
  notifyAfterResponse(async () => {
    const application = await prisma.spentAdjustmentApplication.findUnique({
      where: { id: applicationId },
      select: {
        channel: true,
        orderNo: true,
        amountClaimed: true,
        purchasedAt: true,
        note: true,
        createdAt: true,
        user: { select: { nickname: true, phone: true } },
      },
    });
    if (!application) return;

    await send(
      formatSpentApplicationToWecom({
        userLabel: application.user.nickname || maskPhone(application.user.phone),
        channel: SPENT_CHANNEL_LABELS[application.channel],
        orderNo: application.orderNo,
        amountClaimed: application.amountClaimed,
        purchasedAt: application.purchasedAt,
        submittedAt: application.createdAt,
        note: application.note,
      }),
      "points"
    );
  });
}

export function notifyNewRedemption(redemptionId: string): void {
  notifyAfterResponse(async () => {
    const redemption = await prisma.pointRedemption.findUnique({
      where: { id: redemptionId },
      select: {
        productName: true,
        points: true,
        level: true,
        createdAt: true,
        user: { select: { nickname: true, phone: true } },
      },
    });
    if (!redemption) return;

    await send(
      formatRedemptionToWecom({
        userLabel: redemption.user.nickname || maskPhone(redemption.user.phone),
        productName: redemption.productName,
        points: redemption.points,
        levelLabel: levelDisplay(redemption.level),
        submittedAt: redemption.createdAt,
      }),
      "redemption"
    );
  });
}
