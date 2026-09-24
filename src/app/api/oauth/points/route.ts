/**
 * OAuth 2.0 积分余额端点
 * GET /api/oauth/points - 积分余额（含物化）与最近流水
 *
 * 与主站会话路由（/api/user/points）共用数据操作核心。
 * 要求 scope 含 membership。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { getPointsOverviewResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_overview",
    });
    if (!auth.ok) return auth.response;
    return await getPointsOverviewResponse(auth.payload.id);
  } catch (error) {
    apiConsole.error("[OAuth Points] 异常:", error);
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
