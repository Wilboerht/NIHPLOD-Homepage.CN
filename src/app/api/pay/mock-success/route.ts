/**
 * 模拟支付成功 API（仅开发环境）
 * POST /api/pay/mock-success
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { OrderStatus } from "@/generated/prisma/client";



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

    // 更新订单状态
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PAID,
        paymentNo: `MOCK_${Date.now()}`,
        paymentTime: new Date(),
      },
    });

    console.log(`[MockPay] 模拟支付成功: ${order.orderNo}`);

    return NextResponse.json({
      success: true,
      data: {
        message: "模拟支付成功",
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

