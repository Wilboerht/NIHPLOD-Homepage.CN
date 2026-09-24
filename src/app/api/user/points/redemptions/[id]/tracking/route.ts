/**
 * 用户兑换物流轨迹 API
 * GET /api/user/points/redemptions/[id]/tracking
 *
 * 仅可查询本人兑换记录；未录入运单号返回 400 NO_WAYBILL；
 * 丰桥未配置凭据时返回 supported=false（用户端降级为仅展示运单号）。
 * 数据操作与 OAuth 资源端点（/api/oauth/points/redemptions/[id]/tracking）共用。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { getRedemptionTrackingResponse } from "@/lib/points-mall-api";

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
  return getRedemptionTrackingResponse(user.id, id);
}
