/**
 * 交易流水记录工具
 * 用于统一记录支付/退款资金变动，便于审计和对账
 * 写入失败时不阻断主流程，仅记录日志
 */
import { prisma } from "./prisma";
import { apiConsole } from "@/lib/logger";

interface TransactionRecord {
  orderId: string;
  type: "PAYMENT" | "REFUND";
  gateway: string;
  amount: number;
  status: "SUCCESS" | "FAILED";
  gatewayTrxId?: string | null;
  gatewayRefundId?: string | null;
  rawData?: string;
}

/**
 * 记录交易流水
 * 失败时仅记录日志，不抛出异常，避免影响主业务流程
 */
export async function recordTransaction(data: TransactionRecord): Promise<void> {
  try {
    await prisma.transaction.create({
      data: {
        orderId: data.orderId,
        type: data.type,
        gateway: data.gateway,
        amount: data.amount,
        status: data.status,
        gatewayTrxId: data.gatewayTrxId || null,
        gatewayRefundId: data.gatewayRefundId || null,
        rawData: data.rawData || null,
      },
    });
  } catch (error) {
    // 表不存在或数据库异常时不阻断主流程
    apiConsole.error("[Transaction] 记录交易流水失败:", error);
  }
}

/**
 * 清理过期的交易原始数据（rawData 字段置空，保留流水记录）
 * 防止网关原始响应明文无限增长
 * @param days 保留天数（默认 180 天）
 */
export async function cleanupOldTransactionRawData(days = 180): Promise<number> {
  try {
    const deadline = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await prisma.transaction.updateMany({
      where: {
        createdAt: { lt: deadline },
        rawData: { not: null },
      },
      data: { rawData: null },
    });
    apiConsole.info(`[Transaction] 已清理 ${result.count} 条过期交易原始数据`);
    return result.count;
  } catch (error) {
    apiConsole.error("[Transaction] 清理过期交易原始数据失败:", error);
    return 0;
  }
}
