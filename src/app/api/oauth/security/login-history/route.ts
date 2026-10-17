/**
 * OAuth 2.0 安全中心 · 登录历史
 * GET /api/oauth/security/login-history - 最近 50 条登录尝试（脱敏 IP）
 *
 * 数据核心与网页端 /api/user/login-history 共用（src/lib/security-login-history.ts）。
 * 要求 scope 含 profile。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { listSecurityLoginHistory } from "@/lib/security-login-history";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "profile",
      action: "security_login_history",
    });
    if (!auth.ok) return auth.response;
    const { payload, resJson } = auth;

    const attempts = await listSecurityLoginHistory(payload.id);
    if (!attempts) {
      return resJson(
        { success: false, error: { code: "USER_NOT_FOUND", message: "用户不存在" } },
        404
      );
    }

    return resJson({ success: true, data: { attempts } });
  } catch (error) {
    apiConsole.error("[OAuth Security LoginHistory] 异常:", error);
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
