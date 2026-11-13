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
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
import { getRedemptionsResponse } from "@/lib/points-mall-api";
import { isOAuthClientAllowed } from "@/lib/oauth-constants";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_redemptions",
    });
    if (!auth.ok) return auth.response;
    // 兑换记录含收货人/手机号/地址 PII：membership 不再隐式授予读取权限。
    if (
      !isOAuthClientAllowed("OAUTH_MALL_PII_ALLOWED_CLIENTS", auth.payload.client_id, [
        "wechat-mp-points",
      ])
    ) {
      return auth.resJson(
        { error: "insufficient_scope", error_description: "该客户端未被允许读取兑换收货信息" },
        403
      );
    }
    return decorateOAuthResponse(
      await getRedemptionsResponse(auth.payload.id, request),
      auth.corsHeaders
    );
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
