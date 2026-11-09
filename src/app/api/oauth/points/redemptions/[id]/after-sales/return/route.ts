/**
 * OAuth 填写售后退回运单
 * POST /api/oauth/points/redemptions/[id]/after-sales/return
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { submitReturnShipmentResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: "membership",
      action: "points_after_sales",
    });
    if (!auth.ok) return auth.response;
    const allowed = (process.env.OAUTH_POINTS_REDEEM_ALLOWED_CLIENTS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (allowed.length === 0 || !allowed.includes(auth.payload.client_id)) {
      return auth.resJson(
        { success: false, error: { code: "FORBIDDEN", message: "该应用无权操作兑换售后" } },
        403
      );
    }
    const { id } = await context.params;
    return decorateOAuthResponse(
      await submitReturnShipmentResponse(auth.payload.id, id, request),
      auth.corsHeaders
    );
  } catch (error) {
    apiConsole.error("[OAuth RedemptionReturn] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: await getOAuthCorsHeaders(request) });
}
