/**
 * 主动查询订单支付状态 API
 * POST /api/orders/:id/query-payment
 * 用户可手动触发，用于回调延迟/丢失场景
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUserAuth } from "@/lib/auth";
import { queryAndFulfillOrderPayment } from "@/lib/payment-query";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";

type RouteContext = { params: Promise<{ id: string }> };

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const payload = await verifyUserAuth(request);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    // 限流：每个用户每分钟最多查询 10 次
    const limitResult = await rateLimit(`user:${payload.id}:query-payment`, "default", {
      maxRequests: 10,
      windowMs: 60 * 1000,
    });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "查询过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    // 验证订单归属
    const order = await prisma.order.findFirst({
      where: { id, userId: payload.id },
      select: { id: true, status: true, paymentMethod: true },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    if (!["wechat", "alipay"].includes(order.paymentMethod || "")) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_QUERYABLE", message: "该订单不支持主动查询支付状态" },
        },
        { status: 400 }
      );
    }

    const fulfilled = await queryAndFulfillOrderPayment(order.id);

    return NextResponse.json({
      success: true,
      data: {
        fulfilled,
        status: fulfilled ? "PAID" : order.status,
        message: fulfilled ? "订单已支付" : "订单尚未支付或查询失败",
      },
    });
  } catch (error) {
    apiConsole.error("[QueryPayment] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
