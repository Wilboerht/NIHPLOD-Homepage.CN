/**
 * 支付主动查询兜底服务
 * 当第三方回调丢失或延迟时，主动查询网关订单状态并同步本地订单
 */
import { prisma } from "./prisma";
import { OrderStatus, type Prisma } from "@/generated/prisma/client";
import { queryWechatPayment } from "./wechat-pay";
import { queryAlipayOrder } from "./alipay";
import { moneyStrictEqual } from "./money";
import { apiConsole } from "@/lib/logger";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/**
 * 主动查询并同步订单支付状态
 * @param orderId 本地订单 ID
 * @returns 是否已支付并同步成功
 */
export async function queryAndFulfillOrderPayment(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    apiConsole.error(`[PaymentQuery] 订单不存在: ${orderId}`);
    return false;
  }

  // 只有待支付或支付中的订单需要兜底查询
  if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYING) {
    return order.status === OrderStatus.PAID;
  }

  // 根据支付方式选择查询通道
  if (order.paymentMethod === "wechat") {
    const result = await queryWechatPayment(order.orderNo);
    if (!result.success || !result.paid) return false;

    // 金额校验
    if (result.amount !== undefined && !moneyStrictEqual(order.payAmount, result.amount / 100)) {
      apiConsole.error(
        `[PaymentQuery] 微信订单金额不匹配: ${order.orderNo}, 本地: ${order.payAmount}, 网关: ${result.amount / 100}`
      );
      return false;
    }

    return fulfillOrderAsPaid(order, result.transactionId || `QUERY_${Date.now()}`, "wechat");
  }

  if (order.paymentMethod === "alipay") {
    const result = await queryAlipayOrder(order.orderNo);
    if (!result.success || !result.paid) return false;

    // 金额校验
    if (result.amount !== undefined && !moneyStrictEqual(order.payAmount, result.amount)) {
      apiConsole.error(
        `[PaymentQuery] 支付宝订单金额不匹配: ${order.orderNo}, 本地: ${order.payAmount}, 网关: ${result.amount}`
      );
      return false;
    }

    return fulfillOrderAsPaid(order, result.tradeNo || `QUERY_${Date.now()}`, "alipay");
  }

  // 未指定支付方式（如 mock 或异常订单），无法查询
  return false;
}

/**
 * 将订单标记为已支付（CAS 乐观锁）
 */
async function fulfillOrderAsPaid(
  order: NonNullable<OrderWithItems>,
  paymentNo: string,
  gateway: "wechat" | "alipay"
): Promise<boolean> {
  let fulfilled = false;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: order.id,
        status: { in: [OrderStatus.PENDING, OrderStatus.PAYING] },
      },
      data: {
        status: OrderStatus.PAID,
        paymentMethod: gateway,
        paymentNo,
        paymentTime: new Date(),
      },
    });

    if (updated.count === 0) {
      // 可能已被其他流程处理
      return;
    }

    fulfilled = true;

    // 更新商品销量
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { salesCount: { increment: item.quantity } },
      });
    }

    // 将锁定的优惠券标记为已使用
    const lockedCoupon = await tx.userCoupon.findFirst({
      where: { orderId: order.id, status: "LOCKED" },
    });
    if (lockedCoupon) {
      await tx.userCoupon.update({
        where: { id: lockedCoupon.id },
        data: { status: "USED", usedAt: new Date() },
      });
    }

    // 记录交易流水
    await tx.transaction.create({
      data: {
        orderId: order.id,
        type: "PAYMENT",
        gateway,
        amount: Number(order.payAmount),
        status: "SUCCESS",
        gatewayTrxId: paymentNo,
        rawData: JSON.stringify({ source: "active_query", queriedAt: new Date().toISOString() }),
      },
    });
  });

  if (fulfilled) {
    console.log(`[PaymentQuery] 主动查询完成订单支付: ${order.orderNo}, 网关: ${gateway}`);
  }

  return fulfilled;
}

/**
 * 批量兜底查询所有待支付/支付中超时订单
 * 在自动取消前调用，避免误取消已付款订单
 * @param pendingMinutes 超过多少分钟未支付视为需要查询
 */
export async function queryAndFulfillExpiredPendingOrders(pendingMinutes = 25): Promise<{
  success: boolean;
  fulfilledCount: number;
  error?: string;
}> {
  try {
    const deadline = new Date(Date.now() - pendingMinutes * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PAYING] },
        createdAt: { lt: deadline },
        paymentMethod: { in: ["wechat", "alipay"] },
      },
      orderBy: { createdAt: "asc" },
    });

    let fulfilledCount = 0;
    for (const order of orders) {
      try {
        const fulfilled = await queryAndFulfillOrderPayment(order.id);
        if (fulfilled) fulfilledCount++;
      } catch (err) {
        apiConsole.error(`[PaymentQuery] 查询订单 ${order.orderNo} 失败:`, err);
      }
    }

    console.log(`[PaymentQuery] 批量兜底查询完成: ${fulfilledCount}/${orders.length} 个订单已支付`);
    return { success: true, fulfilledCount };
  } catch (error) {
    apiConsole.error("[PaymentQuery] 批量查询失败:", error);
    return { success: false, fulfilledCount: 0, error: String(error) };
  }
}
