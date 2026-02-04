/**
 * 模拟支付成功 API（仅开发环境）
 * POST /api/pay/mock-success
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { OrderStatus } from "@/generated/prisma/client";

// 购买奖励比例：每消费 1 元获得 1 点
const PURCHASE_REWARD_RATIO = 1;

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

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

    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "订单ID不能为空" } },
        { status: 400 }
      );
    }

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

    if (order.status !== OrderStatus.PENDING) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATUS", message: "订单状态不正确" } },
        { status: 400 }
      );
    }

    // 计算购买奖励点数（每消费1元获得1点，向下取整）
    const pointsEarned = Math.floor(Number(order.payAmount) * PURCHASE_REWARD_RATIO);

    // 使用事务更新订单状态和发放积分
    await prisma.$transaction(async (tx) => {
      // 更新订单状态
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PAID,
          paymentNo: `MOCK_${Date.now()}`,
          paymentTime: new Date(),
          pointsEarned,
        },
      });

      // 发放积分
      if (pointsEarned > 0) {
        const user = await tx.user.update({
          where: { id: payload.id },
          data: {
            points: { increment: pointsEarned },
            totalPoints: { increment: pointsEarned },
          },
        });

        // 记录积分变动
        await tx.pointRecord.create({
          data: {
            userId: payload.id,
            type: "PURCHASE_REWARD",
            amount: pointsEarned,
            balance: user.points,
            description: `订单支付奖励 (${order.orderNo})`,
            relatedId: orderId,
          },
        });

        console.log(`[MockPay] 发放积分: ${pointsEarned} 点`);
      }
    });

    console.log(`[MockPay] 模拟支付成功: ${order.orderNo}`);

    return NextResponse.json({
      success: true,
      data: {
        message: "模拟支付成功",
        pointsEarned,
      },
    });
  } catch (error) {
    console.error("[MockPay] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

