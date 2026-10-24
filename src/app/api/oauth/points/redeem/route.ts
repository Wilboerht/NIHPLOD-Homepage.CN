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
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
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

    // 默认拒绝：OAuth 兑礼必须显式配置官方 client_id 白名单。
    const allowedClients = (process.env.OAUTH_POINTS_REDEEM_ALLOWED_CLIENTS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (allowedClients.length === 0) {
      return auth.resJson(
        {
          success: false,
          error: {
            code: "OAUTH_POINTS_REDEEM_DISABLED",
            message: "OAuth 积分兑礼未配置可用客户端",
          },
        },
        403
      );
    }
    if (!allowedClients.includes(auth.payload.client_id)) {
      return auth.resJson(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "该应用无权发起积分兑礼" },
        },
        403
      );
    }

    return decorateOAuthResponse(
      await redeemPointsResponse(auth.payload.id, request, {
        clientId: auth.payload.client_id,
      }),
      auth.corsHeaders
    );
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
