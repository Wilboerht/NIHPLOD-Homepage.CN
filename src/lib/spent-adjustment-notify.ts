/**
 * 客服代客提交消费补录后的申请人通知：
 * 写入通知 Outbox，由后台 worker 统一发送短信/微信模板/小程序订阅消息。
 */
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import { enqueueNotification } from "./notification-outbox";

export function notifySpentApplicationSubmittedByAdmin(applicationId: string): void {
  void (async () => {
    const application = await prisma.spentAdjustmentApplication.findUnique({
      where: { id: applicationId },
      select: {
        orderNo: true,
        userId: true,
        user: { select: { phone: true } },
      },
    });
    if (!application) return;

    const payload = { orderNo: application.orderNo };
    const baseKey = `spent-submitted:${applicationId}`;
    await Promise.all([
      enqueueNotification({
        idempotencyKey: `${baseKey}:sms`,
        channel: "SMS",
        eventType: "spent_submitted",
        templateKey: "spent_submitted",
        userId: application.userId,
        recipient: { phone: application.user.phone },
        payload,
        aggregateType: "spent_adjustment",
        aggregateId: applicationId,
      }),
      enqueueNotification({
        idempotencyKey: `${baseKey}:wechat`,
        channel: "WECHAT_TEMPLATE",
        eventType: "spent_submitted",
        templateKey: "spent_submitted",
        userId: application.userId,
        recipient: { userId: application.userId },
        payload,
        aggregateType: "spent_adjustment",
        aggregateId: applicationId,
      }),
      enqueueNotification({
        idempotencyKey: `${baseKey}:mp`,
        channel: "MINIPROGRAM",
        eventType: "spent_submitted",
        templateKey: "spent_submitted",
        userId: application.userId,
        recipient: { userId: application.userId },
        payload,
        aggregateType: "spent_adjustment",
        aggregateId: applicationId,
      }),
    ]);
  })().catch((error) => apiConsole.warn("[SpentSubmittedNotify] 通知入队异常:", error));
}
