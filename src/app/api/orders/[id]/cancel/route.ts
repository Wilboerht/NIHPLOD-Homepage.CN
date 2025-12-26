/**
 * 取消订单 API
 * POST /api/orders/:id/cancel
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { cancelOrder } from "@/lib/order";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    const result = await cancelOrder(id, payload.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "CANCEL_FAILED", message: result.error } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "订单已取消" },
    });
  } catch (error) {
    console.error("[CancelOrder] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

