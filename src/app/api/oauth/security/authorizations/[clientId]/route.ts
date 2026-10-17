/**
 * OAuth 2.0 安全中心 · 撤销授权
 * DELETE /api/oauth/security/authorizations/{clientId} - 撤销对指定应用的授权
 *
 * 数据核心与网页端 /api/user/oauth/revoke 共用（src/lib/security-authorizations.ts）。
 * 安全约束：禁止撤销当前小程序自身的授权（会导致操作端立即失去登录态）。
 * 要求 scope 含 profile:write；用户级限流 10 次/小时。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { rateLimit } from "@/lib/ratelimit";
import { revokeSecurityAuthorization } from "@/lib/security-authorizations";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ clientId: string }> };

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "DELETE", {
      scope: "profile:write",
      action: "security_authorization_revoke",
    });
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    const { clientId } = await context.params;
    if (!clientId || clientId.length > 64) {
      return resJson(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        400
      );
    }

    // 禁止撤销当前小程序自身授权（撤销即自身登录态失效）
    if (clientId === payload.client_id) {
      return resJson(
        {
          success: false,
          error: {
            code: "CURRENT_CLIENT",
            message: "不能撤销当前小程序的授权，如需退出请在个人资料中操作",
          },
        },
        400
      );
    }

    const limitResult = await rateLimit(`user:${payload.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!limitResult.success) {
      return resJson(
        { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
        429
      );
    }

    const result = await revokeSecurityAuthorization({
      userId: payload.id,
      clientId,
      ip,
    });
    if (!result.ok) {
      return resJson(
        { success: false, error: { code: result.code, message: result.message } },
        result.status
      );
    }

    return resJson({ success: true, data: { message: "已撤销该应用的授权" } });
  } catch (error) {
    apiConsole.error("[OAuth Security Authorization Revoke] 异常:", error);
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
