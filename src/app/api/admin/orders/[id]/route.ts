/**
 * 管理端订单详情 API
 * GET /api/admin/orders/:id
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, nickname: true, phone: true, avatar: true } },
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
    console.error("[AdminOrderDetail] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

