/**
 * 支付通知幂等性检查
 * 防止重复处理相同的支付通知
 */
import { prisma } from "./prisma";

export interface PaymentNotificationRecord {
  id: string;
  paymentGateway: "wechat" | "alipay"; // 支付网关
  notificationId: string; // 网关返回的通知ID（微信: out_trade_no, 支付宝: trade_no）
  transactionId: string; // 交易ID（微信: transaction_id, 支付宝: trade_no）
  amount: number; // 金额（分）
  status: "PENDING" | "SUCCESS" | "FAILED"; // 处理状态
  rawData: string; // 原始通知数据（JSON字符串）
  errorMessage?: string; // 失败时的错误信息
  processedAt?: Date; // 处理时间
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 检查通知是否已处理过 - 用于幂等性判断
 * @param gateway 支付网关
 * @param notificationId 通知ID
 * @returns 是否已处理
 */
export async function isNotificationProcessed(
  gateway: "wechat" | "alipay",
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

    // 如果处理失败，返回失败信息
    return {
      processed: true,
      status: "FAILED",
      message: record.errorMessage || "通知处理失败",
    };
  } catch (error) {
    console.error("[Notification Idempotency] 检查失败:", error);
    // 发生错误时返回 false，允许再次处理
    return { processed: false };
  }
}

/**
 * 记录通知请求 - 创建新的通知记录
 * @param gateway 支付网关
 * @param notificationId 通知ID
 * @param transactionId 交易ID
 * @param amount 金额（分）
 * @param rawData 原始数据
 */
export async function recordNotification(
  gateway: "wechat" | "alipay",
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
      console.warn(`[Notification] 通知 ${notificationId} 已被其他请求处理`);
      return { success: false, error: "Concurrent processing" };
    }

    console.error("[Notification] 记录失败:", error);
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
    console.error("[Notification] 标记成功失败:", error);
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
    console.error("[Notification] 标记失败失败:", error);
    return false;
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

    console.log(`[Notification] 清理了 ${result.count} 条过期通知记录`);
    return result.count;
  } catch (error) {
    console.error("[Notification] 清理失败:", error);
    return 0;
  }
}
