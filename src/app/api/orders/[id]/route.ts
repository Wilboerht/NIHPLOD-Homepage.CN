/**
 * 单个订单 API
 * GET /api/orders/:id - 获取订单详情
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

// 订单超时时间（30分钟）
const ORDER_TIMEOUT_MINUTES = 30;

type RouteContext = { params: Promise<{ id: string }> };

// 获取订单详情
// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    let order = await prisma.order.findFirst({
      where: { id, userId: payload.id },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    // 检查是否超时未付款，自动取消
    if (order.status === "PENDING") {
      const timeoutDate = new Date(Date.now() - ORDER_TIMEOUT_MINUTES * 60 * 1000);
      if (order.createdAt < timeoutDate) {
        // 更新订单状态为已取消
        order = await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
          include: { items: true },
        });
        console.log(`[Order] 订单 ${order.orderNo} 超时自动取消`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { order },
    });
  } catch (error) {
    console.error("[GetOrder] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

