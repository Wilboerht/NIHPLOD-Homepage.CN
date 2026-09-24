/**
 * OAuth 2.0 收货地址单条操作端点
 * PATCH  /api/oauth/addresses/[id] - 编辑地址
 * DELETE /api/oauth/addresses/[id] - 删除地址
 *
 * 与主站会话路由（/api/user/addresses/[id]）共用数据操作核心。
 * 要求 scope 含 membership。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { updateAddressResponse, deleteAddressResponse } from "@/lib/points-mall-api";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "PATCH", {
      scope: "membership",
      action: "addresses_update",
    });
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    return await updateAddressResponse(auth.payload.id, id, request);
  } catch (error) {
    apiConsole.error("[OAuth Addresses] 编辑异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "DELETE", {
      scope: "membership",
      action: "addresses_delete",
    });
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    return await deleteAddressResponse(auth.payload.id, id);
  } catch (error) {
    apiConsole.error("[OAuth Addresses] 删除异常:", error);
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
