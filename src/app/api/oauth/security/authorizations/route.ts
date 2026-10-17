/**
 * OAuth 2.0 安全中心 · 授权管理列表
 * GET /api/oauth/security/authorizations - 当前用户已授权的第三方应用
 *
 * 数据核心与网页端 /api/user/oauth/sessions 共用（src/lib/security-authorizations.ts）。
 * 按 clientId 去重，每 client 返回最近一条；`isCurrentClient` 标记当前小程序自身。
 * 要求 scope 含 profile。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { listSecurityAuthorizations } from "@/lib/security-authorizations";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "profile",
      action: "security_authorizations",
    });
    if (!auth.ok) return auth.response;
    const { payload, resJson } = auth;

    const list = await listSecurityAuthorizations(payload.id);
    const authorizations = list.map((a) => ({
      ...a,
      isCurrentClient: a.clientId === payload.client_id,
    }));

    return resJson({ success: true, data: { authorizations } });
  } catch (error) {
    apiConsole.error("[OAuth Security Authorizations] 异常:", error);
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
