/**
 * OAuth 积分兑换详情
 * GET /api/oauth/points/redemptions/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { getRedemptionDetailResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_redemptions_read",
    });
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    return decorateOAuthResponse(
      await getRedemptionDetailResponse(auth.payload.id, id),
      auth.corsHeaders
    );
  } catch (error) {
    apiConsole.error("[OAuth RedemptionDetail] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: await getOAuthCorsHeaders(request) });
}
