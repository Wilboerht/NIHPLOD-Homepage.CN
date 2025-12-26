/**
 * 单个订单 API
 * GET /api/orders/:id - 获取订单详情
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

// 获取订单详情
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

    const order = await prisma.order.findFirst({
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

