/**
 * 客服代客提交消费补录后的申请人通知。
 *
 * 用户此前不会收到“已代提交”提醒，只会收到审核结果。这里在创建成功后
 * 异步发送短信 / 微信模板 / 小程序订阅消息；任一通道未配置或失败均不影响提交。
 */
import { after } from "next/server";
import { prisma } from "./prisma";
import { apiConsole } from "./logger";
import { sendSpentSubmittedNotification } from "./sms";
import { sendSpentAdjustmentSubmittedMessage } from "./wechat-template";
import { notifyPointsSpentSubmitted } from "./miniprogram-notify";

function notifyAfterResponse(task: () => Promise<void>): void {
  const run = () => {
    void task().catch((error) => apiConsole.warn("[SpentSubmittedNotify] 通知异常:", error));
  };
  try {
    after(run);
  } catch {
    // 非请求上下文（测试 / 脚本）：直接 fire-and-forget
    run();
  }
}

export function notifySpentApplicationSubmittedByAdmin(applicationId: string): void {
  notifyAfterResponse(async () => {
    const application = await prisma.spentAdjustmentApplication.findUnique({
      where: { id: applicationId },
      select: {
        orderNo: true,
        userId: true,
        user: { select: { phone: true } },
      },
    });
    if (!application) return;

    await Promise.allSettled([
      sendSpentSubmittedNotification(application.user.phone, application.orderNo),
      sendSpentAdjustmentSubmittedMessage({
        userId: application.userId,
        orderNo: application.orderNo,
      }),
      notifyPointsSpentSubmitted({ userId: application.userId }),
    ]);
  });
}
