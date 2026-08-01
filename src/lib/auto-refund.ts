/**
 * 订单取消后支付成功的自动退款服务
 *
 * 解决竞态：用户支付成功但订单已被取消（cron 超时取消或用户手动取消），
 * 延迟到达的支付回调必须触发自动退款，避免用户被扣款。
 * 独立模块避免 refund.ts ↔ wechat-pay.ts / alipay.ts 的循环依赖。
 */
import { OrderStatus } from "@/generated/prisma/client";
import { applyWechatRefund, generateRefundNo } from "./wechat-pay";
import { refundAlipayOrder } from "./alipay";
import { finalizeRefund } from "./refund";
import { apiConsole } from "@/lib/logger";

export interface CancelledPaidOrder {
  orderId: string;
  orderNo: string;
  payAmount: number;
  paymentMethod: string | null;
}

/**
 * 对已取消但支付成功的订单发起自动退款
 *
 * 幂等性：finalizeRefund 内部对 REFUNDED 状态有幂等保护；
 * 退款申请失败时记录日志，等待退款回调/人工处理。
 */
export async function autoRefundCancelledOrder(order: CancelledPaidOrder): Promise<void> {
  const { orderId, orderNo, payAmount, paymentMethod } = order;
  apiConsole.warn(`[AutoRefund] 订单 ${orderNo} 已取消但支付成功，自动退款 ¥${payAmount}`);

  if (paymentMethod === "wechat") {
    const refundNo = generateRefundNo(orderNo);
    const result = await applyWechatRefund(orderNo, refundNo, payAmount, payAmount, "订单已取消，自动退款");
    if (result.success) {
      await finalizeRefund(orderId, result.refundId || refundNo, payAmount);
    } else {
      apiConsole.error(`[AutoRefund] 微信自动退款失败: ${orderNo}`, result.error);
    }
    return;
  }

  if (paymentMethod === "alipay") {
    const result = await refundAlipayOrder(orderNo, payAmount, "订单已取消，自动退款", payAmount);
    if (result.success) {
      await finalizeRefund(orderId, orderNo, payAmount);
    } else {
      apiConsole.error(`[AutoRefund] 支付宝自动退款失败: ${orderNo}`, result.error);
    }
    return;
  }

  apiConsole.warn(`[AutoRefund] 订单 ${orderNo} 支付方式未知，跳过自动退款`);
}

/**
 * 从订单记录判断是否需要自动退款并执行
 * @param order - 已查询到的订单（含 items）
 */
export async function autoRefundIfCancelledPaid(
  order: { id: string; orderNo: string; payAmount: unknown; paymentMethod: string | null; status: string }
): Promise<void> {
  if (order.status !== OrderStatus.CANCELLED) return;
  await autoRefundCancelledOrder({
    orderId: order.id,
    orderNo: order.orderNo,
    payAmount: Number(order.payAmount),
    paymentMethod: order.paymentMethod,
  });
}
