/**
 * OAuth 2.0 积分礼品列表端点
 * GET /api/oauth/points/gifts - 可兑换礼品（含按当前等级折算的所需积分与详情）
 *
 * 与主站会话路由（/api/user/points/gifts）共用数据操作核心。
 * 要求 scope 含 membership。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
import { getPointGiftsResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_gifts",
    });
    if (!auth.ok) return auth.response;
    return decorateOAuthResponse(await getPointGiftsResponse(auth.payload.id), auth.corsHeaders);
  } catch (error) {
    apiConsole.error("[OAuth PointGifts] 异常:", error);
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
