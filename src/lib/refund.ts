import { prisma } from "./prisma";
import { OrderStatus, RefundStatus } from "@/generated/prisma/client";
import { applyWechatRefund, generateRefundNo } from "./wechat-pay";
import { refundAlipayOrder } from "./alipay";
import { ensureMoneyPrecision } from "./money";

/**
 * 退款最终确认（恢复库存、回滚销量、释放优惠券）
 * 用于：支付宝同步退款成功后、微信/支付宝退款回调确认后
 */
export async function finalizeRefund(
  orderId: string,
  refundNo: string | null,
  refundAmount: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new Error("订单不存在");
    if (order.status === OrderStatus.REFUNDED) return; // 已处理，幂等

    // 更新订单状态
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.REFUNDED,
        refundNo: refundNo || order.refundNo,
        refundAmount: ensureMoneyPrecision(refundAmount),
        refundTime: new Date(),
        refundStatus: RefundStatus.SUCCESS,
      },
    });

    // 恢复库存 + 回滚销量
    for (const item of order.items) {
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (product) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
            salesCount: { decrement: item.quantity },
          },
        });
      }
    }

    // 释放优惠券
    const lockedCoupon = await tx.userCoupon.findFirst({
      where: { orderId: orderId, status: "LOCKED" },
    });
    if (lockedCoupon) {
      await tx.userCoupon.update({
        where: { id: lockedCoupon.id },
        data: { status: "UNUSED", usedAt: null, orderId: null },
      });
    }
  });
}

/**
 * 申请退款
 */
export async function applyRefund(
  orderId: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
    });

    if (!order) {
      return { success: false, error: "订单不存在" };
    }

    // 只有已支付/已发货的订单可以申请退款
    const refundableStatus: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
    ];

    if (!refundableStatus.includes(order.status)) {
      return { success: false, error: "该订单状态不支持退款" };
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.REFUNDING,
        remark: order.remark ? `${order.remark}\n[退款申请] ${reason}` : `[退款申请] ${reason}`,
      },
    });

    console.log(`[Refund] 退款申请: ${order.orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[Refund] 申请失败:", error);
    return { success: false, error: "申请失败" };
  }
}

/**
 * 处理退款（管理员操作）
 */
export async function processRefund(
  orderId: string,
  approved: boolean,
  adminRemark?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return { success: false, error: "订单不存在" };
    }

    if (order.status !== OrderStatus.REFUNDING) {
      return { success: false, error: "订单状态不正确" };
    }

    if (approved) {
      const refundAmount = Number(order.payAmount);
      let refundNo: string | null = null;
      let refundInfo = "";

      // 1. 微信支付：调用退款接口，成功后只记录信息，等回调确认
      if (order.paymentMethod === "wechat" && order.payAmount) {
        refundNo = generateRefundNo(order.orderNo);
        console.log(`[Refund] 发起微信退款: ${order.orderNo}, 金额: ${refundAmount}`);

        const refundRes = await applyWechatRefund(
          order.orderNo,
          refundNo,
          refundAmount,
          refundAmount,
          adminRemark || "管理员同意退款"
        );

        if (!refundRes.success) {
          console.error(`[Refund] 微信退款失败: ${refundRes.error}`);
          return { success: false, error: `微信退款失败: ${refundRes.error}` };
        }

        refundInfo = ` | 微信退款已受理 (单号: ${refundRes.refundId || refundNo})`;

        // 微信支付是异步的，只记录退款信息，保持 REFUNDING 状态，等回调确认
        await prisma.order.update({
          where: { id: orderId },
          data: {
            refundNo,
            refundAmount: ensureMoneyPrecision(refundAmount),
            adminNote: order.adminNote
              ? `${order.adminNote}\n[退款审批] ${adminRemark || "同意退款"}${refundInfo}`
              : `[退款审批] ${adminRemark || "同意退款"}${refundInfo}`,
          },
        });
      }

      // 2. 支付宝退款：同步接口，成功后直接 finalize
      else if (order.paymentMethod === "alipay" && order.payAmount) {
        console.log(`[Refund] 发起支付宝退款: ${order.orderNo}`);

        const refundRes = await refundAlipayOrder(
          order.orderNo,
          refundAmount,
          adminRemark || "退款"
        );

        if (!refundRes.success) {
          console.error(`[Refund] 支付宝退款失败: ${refundRes.error}`);
          return { success: false, error: `支付宝退款失败: ${refundRes.error}` };
        }

        refundInfo = " | 支付宝退款成功";
        refundNo = `${order.orderNo}-${Date.now()}`;

        // 支付宝同步退款成功，直接 finalize
        await finalizeRefund(orderId, refundNo, refundAmount);
      }

      // 3. 其他支付方式（如模拟支付）：直接 finalize
      else {
        refundNo = `MANUAL_${Date.now()}`;
        await finalizeRefund(orderId, refundNo, refundAmount);
        refundInfo = " | 手动退款成功";
      }

      // 更新 adminNote（如果上面没更新的话）
      if (order.paymentMethod !== "wechat") {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            adminNote: order.adminNote
              ? `${order.adminNote}\n[退款审批] ${adminRemark || "同意退款"}${refundInfo}`
              : `[退款审批] ${adminRemark || "同意退款"}${refundInfo}`,
          },
        });
      }

      console.log(`[Refund] 退款处理成功: ${order.orderNo}`);
    } else {
      // 拒绝退款：恢复到退款前状态
      const previousStatus = order.trackingNo ? OrderStatus.SHIPPED : OrderStatus.PAID;
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: previousStatus,
          adminNote: order.adminNote
            ? `${order.adminNote}\n[退款拒绝] ${adminRemark || ""}`
            : `[退款拒绝] ${adminRemark || ""}`,
        },
      });

      console.log(`[Refund] 退款拒绝: ${order.orderNo}`);
    }

    return { success: true };
  } catch (error) {
    console.error("[Refund] 处理失败:", error);
    return { success: false, error: "处理失败" };
  }
}

/**
 * 取消退款申请
 */
export async function cancelRefund(
  orderId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId },
    });

    if (!order) {
      return { success: false, error: "订单不存在" };
    }

    if (order.status !== OrderStatus.REFUNDING) {
      return { success: false, error: "订单状态不正确" };
    }

    // 恢复到退款前状态
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: order.trackingNo ? OrderStatus.SHIPPED : OrderStatus.PAID,
        remark: order.remark?.replace(/\n?\[退款申请\].*/, "") || null,
      },
    });

    console.log(`[Refund] 取消退款: ${order.orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[Refund] 取消失败:", error);
    return { success: false, error: "操作失败" };
  }
}
