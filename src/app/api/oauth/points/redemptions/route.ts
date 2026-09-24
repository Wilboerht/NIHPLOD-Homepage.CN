/**
 * OAuth 2.0 兑换记录端点
 * GET /api/oauth/points/redemptions?offset=10 - 我的兑换记录（offset 分页）
 *
 * 与主站会话路由（/api/user/points/redemptions）共用数据操作核心。
 * 要求 scope 含 membership。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { getRedemptionsResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_redemptions",
    });
    if (!auth.ok) return auth.response;
    return await getRedemptionsResponse(auth.payload.id, request);
  } catch (error) {
    apiConsole.error("[OAuth PointRedemptions] 异常:", error);
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
