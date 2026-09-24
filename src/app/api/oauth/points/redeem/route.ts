/**
 * OAuth 2.0 积分兑换端点
 * POST /api/oauth/points/redeem - 兑换礼品（requestId 幂等；地址快照入库）
 *
 * 与主站会话路由（/api/user/points/redeem）共用数据操作核心。
 * 要求 scope 含 membership。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { redeemPointsResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: "membership",
      action: "points_redeem",
    });
    if (!auth.ok) return auth.response;
    return await redeemPointsResponse(auth.payload.id, request);
  } catch (error) {
    apiConsole.error("[OAuth PointRedeem] 异常:", error);
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
