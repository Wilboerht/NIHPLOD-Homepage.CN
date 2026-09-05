/**
 * 用户兑换物流轨迹 API
 * GET /api/user/points/redemptions/[id]/tracking
 *
 * 仅可查询本人兑换记录；未录入运单号返回 400 NO_WAYBILL；
 * 丰桥未配置凭据时返回 supported=false（用户端降级为仅展示运单号）。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";
import { validateCUID, invalidIdResponse } from "@/lib/validation";
import { querySfRoutes } from "@/lib/sf-express";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return invalidIdResponse();
    }

    const redemption = await prisma.pointRedemption.findUnique({
      where: { id },
      select: { userId: true, carrier: true, waybillNo: true },
    });
    if (!redemption || redemption.userId !== user.id) {
      // 越权查询统一 404，不泄露记录存在性
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "兑换记录不存在" } },
        { status: 404 }
      );
    }

    if (!redemption.waybillNo) {
      return NextResponse.json(
        { success: false, error: { code: "NO_WAYBILL", message: "暂无运单号" } },
        { status: 400 }
      );
    }

    const result = await querySfRoutes(redemption.waybillNo);

    if (!result.ok) {
      if (result.reason === "NOT_CONFIGURED") {
        return NextResponse.json({
          success: true,
          data: {
            waybillNo: redemption.waybillNo,
            carrier: redemption.carrier,
            supported: false,
            routes: null,
            error: null,
          },
        });
      }
      return NextResponse.json({
        success: true,
        data: {
          waybillNo: redemption.waybillNo,
          carrier: redemption.carrier,
          supported: true,
          routes: null,
          error: result.message ?? "轨迹查询失败",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        waybillNo: redemption.waybillNo,
        carrier: redemption.carrier,
        supported: true,
        routes: result.routes,
        error: null,
      },
    });
  } catch (error) {
    apiConsole.error("[UserPointTracking] 轨迹查询失败:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500 }
    );
  }
}
