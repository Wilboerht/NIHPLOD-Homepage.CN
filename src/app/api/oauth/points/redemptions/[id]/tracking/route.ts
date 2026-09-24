/**
 * OAuth 2.0 兑换物流轨迹端点
 * GET /api/oauth/points/redemptions/[id]/tracking - 本人兑换记录的物流轨迹
 *
 * 与主站会话路由（/api/user/points/redemptions/[id]/tracking）共用数据操作核心。
 * 要求 scope 含 membership。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { getRedemptionTrackingResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_tracking",
    });
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    return await getRedemptionTrackingResponse(auth.payload.id, id);
  } catch (error) {
    apiConsole.error("[OAuth PointTracking] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
