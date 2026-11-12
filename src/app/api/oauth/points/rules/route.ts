/**
 * OAuth 2.0 积分规则端点
 * GET /api/oauth/points/rules - 积分获取/有效期/等级门槛/兑礼率
 *
 * 规则为全站统一配置（代码常量），不返回用户私有数据；
 * 要求 scope 含 membership，与积分相关端点保持一致。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
import { getPointsRulesView } from "@/lib/points-rules";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_rules",
    });
    if (!auth.ok) return auth.response;

    return decorateOAuthResponse(
      NextResponse.json(
        { success: true, data: getPointsRulesView() },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      ),
      auth.corsHeaders
    );
  } catch (error) {
    apiConsole.error("[OAuth PointsRules] 异常:", error);
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
