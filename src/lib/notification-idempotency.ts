/**
 * 支付通知幂等性检查
 * 防止重复处理相同的支付通知
 */
import { prisma } from "./prisma";
import { apiConsole } from "@/lib/logger";

/**
 * 检查通知是否已处理过 - 用于幂等性判断
 * @param gateway 支付网关
 * @param notificationId 通知ID
 * @returns 是否已处理
 */
export async function isNotificationProcessed(
  gateway: "wechat" | "alipay" | "wechat_refund" | "alipay_refund",
  notificationId: string
): Promise<{
  processed: boolean;
  status?: "SUCCESS" | "FAILED" | "PENDING";
  message?: string;
}> {
  try {
    const record = await prisma.paymentNotification.findUnique({
      where: {
        gateway_notificationId: {
          gateway,
          notificationId,
        },
      },
    });

    if (!record) {
      return { processed: false };
    }

    // 如果已成功处理，直接返回
    if (record.status === "SUCCESS") {
      return {
        processed: true,
        status: "SUCCESS",
        message: "通知已成功处理",
      };
    }

    // 如果处理中，返回待处理
    if (record.status === "PENDING") {
      return {
        processed: false, // 虽然有记录但未完成，允许重新处理
        status: "PENDING",
        message: "通知处理中",
      };
    }

    // 如果处理失败，允许重试（返回 processed: false）
    // 支付渠道会重发通知，重试时重新处理
    return {
      processed: false,
      status: "FAILED",
      message: record.errorMessage || "通知处理失败",
    };
  } catch (error) {
    apiConsole.error("[Notification Idempotency] 检查失败:", error);
    // 发生错误时返回 false，允许再次处理
    return { processed: false };
  }
}

/**
 * 记录通知请求 - 创建新的通知记录
 * @param gateway 支付网关
 * @param notificationId 通知ID
 * @param transactionId 交易ID
 * @param amount 金额（元，Decimal）
 * @param rawData 原始数据
 */
export async function recordNotification(
  gateway: "wechat" | "alipay" | "wechat_refund" | "alipay_refund",
  notificationId: string,
  transactionId: string,
  amount: number,
  rawData: unknown
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  try {
    const record = await prisma.paymentNotification.create({
      data: {
        gateway,
        notificationId,
        transactionId,
        amount,
        status: "PENDING",
        rawData: JSON.stringify(rawData),
      },
    });

    return { success: true, recordId: record.id };
  } catch (error: unknown) {
    // 可能已存在该记录（并发请求）
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      apiConsole.warn(`[Notification] 通知 ${notificationId} 已被其他请求处理`);
      return { success: false, error: "Concurrent processing" };
    }

    apiConsole.error("[Notification] 记录失败:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * 标记通知处理成功
 * @param recordId 记录ID
 */
export async function markNotificationSuccess(recordId: string): Promise<boolean> {
  try {
    await prisma.paymentNotification.update({
      where: { id: recordId },
      data: {
        status: "SUCCESS",
        processedAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    apiConsole.error("[Notification] 标记成功失败:", error);
    return false;
  }
}

/**
 * 标记通知处理失败
 * @param recordId 记录ID
 * @param errorMessage 错误信息
 */
export async function markNotificationFailed(
  recordId: string,
  errorMessage: string
): Promise<boolean> {
  try {
    await prisma.paymentNotification.update({
      where: { id: recordId },
      data: {
        status: "FAILED",
        errorMessage,
        processedAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    apiConsole.error("[Notification] 标记失败失败:", error);
    return false;
  }
}

/**
 * 修复卡住的通知记录（PENDING 超时自愈）
 * 场景：请求在处理过程中崩溃，导致 PENDING 记录永久残留
 * 修复：将超过超时时间的 PENDING 记录标记为 FAILED，允许后续重试正确处理
 * @param timeoutMinutes 超时时间（分钟），默认 5 分钟
 */
export async function healStuckNotifications(timeoutMinutes: number = 5): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const result = await prisma.paymentNotification.updateMany({
      where: {
        status: "PENDING",
        createdAt: {
          lt: cutoffDate,
        },
      },
      data: {
        status: "FAILED",
        errorMessage: "TIMEOUT_HEAL: 处理超时，允许重试",
        processedAt: new Date(),
      },
    });

    if (result.count > 0) {
      console.warn(
        `[Notification] 修复了 ${result.count} 条卡住的 PENDING 通知记录（超时 ${timeoutMinutes} 分钟）`
      );
    }
    return result.count;
  } catch (error) {
    apiConsole.error("[Notification] 修复卡住记录失败:", error);
    return 0;
  }
}

/**
 * 清理过期的通知记录（可选）
 * @param daysOld 多少天以前的记录
 */
export async function cleanupOldNotifications(daysOld: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await prisma.paymentNotification.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        status: {
          in: ["SUCCESS", "FAILED"],
        },
      },
    });

    apiConsole.info(`[Notification] 清理了 ${result.count} 条过期通知记录`);
    return result.count;
  } catch (error) {
    apiConsole.error("[Notification] 清理失败:", error);
    return 0;
  }
}
