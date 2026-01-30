import { prisma } from "./prisma";
import { OrderStatus } from "@/generated/prisma/client";
import { applyWechatRefund, generateRefundNo } from "./wechat-pay";
import { refundAlipayOrder } from "./alipay";
import { refundUnionPayOrder } from "./unionpay";

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
        remark: reason,
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
      // 1. 如果是微信支付，先调用微信退款接口
      let refundInfo = "";
      if (order.paymentMethod === "wechat" && order.payAmount) {
        const refundNo = generateRefundNo(order.orderNo);
        const refundAmount = Number(order.payAmount);

        console.log(`[Refund] 发起微信退款: ${order.orderNo}, 金额: ${refundAmount}`);

        const refundRes = await applyWechatRefund(
          order.orderNo,
          refundNo,
          refundAmount,
          refundAmount, // 全额退款
          adminRemark || "管理员同意退款"
        );

        if (!refundRes.success) {
          console.error(`[Refund] 微信退款失败: ${refundRes.error}`);
          return { success: false, error: `微信退款失败: ${refundRes.error}` };
        }

        refundInfo = ` | 微信退款申请成功 (单号: ${refundRes.refundId || refundNo})`;
      }

      // 支付宝退款
      if (order.paymentMethod === "alipay" && order.payAmount) {
        const refundAmount = Number(order.payAmount);
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
      }

      // 银联退款
      if (order.paymentMethod === "unionpay" && order.payAmount && order.paymentNo) {
        const refundAmount = Number(order.payAmount);
        console.log(`[Refund] 发起银联退款: ${order.orderNo}`);

        const refundRes = await refundUnionPayOrder(
          order.orderNo,
          order.paymentNo,
          refundAmount
        );

        if (!refundRes.success) {
          console.error(`[Refund] 银联退款失败: ${refundRes.error}`);
          return { success: false, error: `银联退款失败: ${refundRes.error}` };
        }

        refundInfo = " | 银联退款受理成功";
      }

      // 2. 只有退款接口调用成功（或非微信支付），才更新数据库
      await prisma.$transaction(async (tx) => {
        // 更新订单状态
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.REFUNDED,
            adminNote: (adminRemark || "") + refundInfo,
          },
        });

        // 恢复库存
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      });

      console.log(`[Refund] 退款处理成功: ${order.orderNo}`);
    } else {
      // 拒绝退款
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: order.trackingNo ? OrderStatus.SHIPPED : OrderStatus.PAID,
          adminNote: adminRemark,
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
        remark: null,
      },
    });

    console.log(`[Refund] 取消退款: ${order.orderNo}`);
    return { success: true };
  } catch (error) {
    console.error("[Refund] 取消失败:", error);
    return { success: false, error: "操作失败" };
  }
}

