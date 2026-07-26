/**
 * 模拟支付成功 API（仅开发环境）
 * POST /api/pay/mock-success
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { OrderStatus } from "@/generated/prisma/client";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { creditPointsForOrder } from "@/lib/points";

const mockSuccessSchema = z.object({
  orderId: z.string().min(1, "订单ID不能为空"),
});

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 仅开发环境可用
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "仅开发环境可用" } },
      { status: 403 }
    );
  }

  try {
    const payload = await verifyUserAuth(request);

    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    const body = await request.json();
    const parsed = mockSuccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: "参数错误", details: parsed.error.issues },
        },
        { status: 400 }
      );
    }
    const { orderId } = parsed.data;

    // 验证订单归属
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: payload.id },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYING) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATUS", message: "订单状态不正确" } },
        { status: 400 }
      );
    }

    // 检查订单是否已超时（30 分钟）
    const ORDER_TIMEOUT_MS = 30 * 60 * 1000;
    const orderAge = Date.now() - order.createdAt.getTime();
    if (orderAge > ORDER_TIMEOUT_MS) {
      return NextResponse.json(
        { success: false, error: { code: "ORDER_EXPIRED", message: "订单已超时，请重新下单" } },
        { status: 400 }
      );
    }

    // 更新订单状态并增加销量
    await prisma.$transaction(async (tx) => {
      const orderWithItems = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!orderWithItems) throw new Error("订单不存在");

      const paymentNo = `MOCK_${Date.now()}`;

      // CAS 乐观锁：只有 PENDING 或 PAYING 状态的订单才能被模拟支付
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: [OrderStatus.PENDING, OrderStatus.PAYING] } },
        data: {
          status: OrderStatus.PAID,
          paymentMethod: "mock",
          paymentNo,
          paymentTime: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new Error("订单已被并发处理或状态已变更");
      }

      // 更新商品销量
      for (const item of orderWithItems.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { salesCount: { increment: item.quantity } },
        });
      }

      // 将锁定的优惠券标记为已使用
      const lockedCoupon = await tx.userCoupon.findFirst({
        where: { orderId: orderId, status: "LOCKED" },
      });
      if (lockedCoupon) {
        await tx.userCoupon.update({
          where: { id: lockedCoupon.id },
          data: { status: "USED", usedAt: new Date() },
        });
      }

      // 记录交易流水，与真实支付保持一致
      await tx.transaction.create({
        data: {
          orderId,
          type: "PAYMENT",
          gateway: "mock",
          amount: Number(orderWithItems.payAmount),
          status: "SUCCESS",
          gatewayTrxId: paymentNo,
          rawData: JSON.stringify({ source: "mock_success", createdAt: new Date().toISOString() }),
        },
      });

      // VIP 积分奖励
      await creditPointsForOrder({
        tx,
        orderId,
        userId: orderWithItems.userId,
        payAmount: Number(orderWithItems.payAmount),
        orderNo: orderWithItems.orderNo,
      });
    });

    if (process.env.NODE_ENV === "development")
      apiConsole.debug(`[MockPay] 模拟支付成功: ${order.orderNo}`);

    return NextResponse.json({
      success: true,
      data: {
        message: "模拟支付成功",
      },
    });
  } catch (error) {
    apiConsole.error("[MockPay] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
