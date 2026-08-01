/**
 * 退款 API
 * POST /api/orders/:id/refund - 申请退款
 * DELETE /api/orders/:id/refund - 取消退款申请
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { applyRefund, cancelRefund } from "@/lib/refund";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { z } from "zod";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

const refundSchema = z.object({
  reason: z.string().min(1, "请填写退款原因").max(200),
});

// 申请退款
// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "refund-request");
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

    const body = await request.json();

    const result = refundSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" },
        },
        { status: 400 }
      );
    }

    const { reason } = result.data;

    const refundResult = await applyRefund(id, payload.id, reason);

    if (!refundResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "REFUND_FAILED", message: refundResult.error } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "退款申请已提交",
      },
    });
  } catch (error) {
    apiConsole.error("[ApplyRefund] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

// 取消退款申请
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIP(request);
    const limitResult = await rateLimit(ip, "refund-request");
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

    const result = await cancelRefund(id, payload.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "CANCEL_FAILED", message: result.error } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "退款申请已取消" },
    });
  } catch (error) {
    apiConsole.error("[CancelRefund] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
