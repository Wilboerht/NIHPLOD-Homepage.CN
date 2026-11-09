/**
 * 用户兑换详情/时间线
 * GET /api/user/points/redemptions/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { getRedemptionDetailResponse } from "@/lib/points-mall-api";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await verifyUserAuth(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
      { status: 401 }
    );
  }
  const { id } = await context.params;
  return getRedemptionDetailResponse(user.id, id);
}
