/**
 * 取消订单 API
 * POST /api/orders/:id/cancel
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { cancelOrder } from "@/lib/order";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "order-create", { maxRequests: 20 });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

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
    apiConsole.error("[CancelOrder] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
