/**
 * OAuth 2.0 收货地址端点
 * GET  /api/oauth/addresses - 地址列表
 * POST /api/oauth/addresses - 新增地址（第一条自动默认）
 *
 * 与主站会话路由（/api/user/addresses）共用数据操作核心。
 * 地址仅用于积分兑礼寄送，要求 scope 含 membership（与积分商城同族）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { getAddressesResponse, createAddressResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "membership",
      action: "addresses_list",
    });
    if (!auth.ok) return auth.response;
    return await getAddressesResponse(auth.payload.id);
  } catch (error) {
    apiConsole.error("[OAuth Addresses] 查询异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "POST", {
      scope: "membership",
      action: "addresses_create",
    });
    if (!auth.ok) return auth.response;
    return await createAddressResponse(auth.payload.id, request);
  } catch (error) {
    apiConsole.error("[OAuth Addresses] 新增异常:", error);
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
