/**
 * OAuth 2.0 安全中心 · 账号绑定列表
 * GET /api/oauth/security/identities - 当前用户已绑定的第三方身份
 *
 * 数据核心与网页端 /api/user/identities 共用（src/lib/security-identities.ts）。
 * 不返回 subjectId（openid），避免平台标识泄漏。
 * 要求 scope 含 profile。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { listSecurityIdentities } from "@/lib/security-identities";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "GET", {
      scope: "profile",
      action: "security_identities",
    });
    if (!auth.ok) return auth.response;

    const identities = await listSecurityIdentities(auth.payload.id);
    return auth.resJson({ success: true, data: { identities } });
  } catch (error) {
    apiConsole.error("[OAuth Security Identities] 异常:", error);
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
