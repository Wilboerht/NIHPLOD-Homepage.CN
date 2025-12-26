/**
 * 确认收货 API
 * POST /api/orders/:id/confirm
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { confirmReceipt } from "@/lib/logistics";

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

    const result = await confirmReceipt(id, payload.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "CONFIRM_FAILED", message: result.error } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: result.pointsEarned
          ? `已确认收货，获得 ${result.pointsEarned} 护肤点数`
          : "已确认收货",
        pointsEarned: result.pointsEarned || 0,
      },
    });
  } catch (error) {
    console.error("[ConfirmReceipt] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

