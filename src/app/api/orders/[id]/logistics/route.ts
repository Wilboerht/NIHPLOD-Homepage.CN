/**
 * 物流信息 API
 * GET /api/orders/:id/logistics - 查询物流信息
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { queryLogistics } from "@/lib/logistics";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

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

    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    // 验证订单归属
    const order = await prisma.order.findFirst({
      where: { id, userId: payload.id },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "订单不存在" } },
        { status: 404 }
      );
    }

    const logistics = await queryLogistics(id);

    if (!logistics) {
      return NextResponse.json(
        { success: false, error: { code: "NO_LOGISTICS", message: "暂无物流信息" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { logistics },
    });
  } catch (error) {
    apiConsole.error("[GetLogistics] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
