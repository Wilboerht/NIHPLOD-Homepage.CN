/**
 * 发货 API
 * POST /api/admin/orders/:id/ship
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { shipOrder } from "@/lib/logistics";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const shipSchema = z.object({
  logisticsCompany: z.string().min(1, "请选择物流公司"),
  trackingNo: z.string().min(1, "请填写快递单号"),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await verifyAuth(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "未授权" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();

    const result = shipSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: result.error.issues[0]?.message || "参数错误" } },
        { status: 400 }
      );
    }

    const { logisticsCompany, trackingNo } = result.data;

    const shipResult = await shipOrder(id, logisticsCompany, trackingNo);

    if (!shipResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "SHIP_FAILED", message: shipResult.error } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "发货成功" },
    });
  } catch (error) {
    console.error("[AdminShip] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}

