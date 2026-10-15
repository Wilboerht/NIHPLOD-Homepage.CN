/**
 * OAuth 2.0 积分明细端点
 * GET /api/oauth/points/ledger?offset=0 - 近一年积分流水（分页，含流水号）
 *
 * 与积分余额端点共用鉴权口径；数据核心在 lib/points-mall-api.ts。
 * 要求 scope 含 membership。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { decorateOAuthResponse } from "@/lib/oauth-resource-auth";
import { getPointsLedgerResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "points_ledger",
    });
    if (!auth.ok) return auth.response;
    // 共享核心返回裸 JSON 响应：补 CORS 白名单头与 no-store（响应含积分流水）
    return decorateOAuthResponse(await getPointsLedgerResponse(auth.payload.id, request), auth.corsHeaders);
  } catch (error) {
    apiConsole.error("[OAuth PointsLedger] 异常:", error);
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
