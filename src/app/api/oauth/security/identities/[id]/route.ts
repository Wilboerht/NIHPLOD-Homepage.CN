/**
 * OAuth 2.0 安全中心 · 解绑第三方身份
 * DELETE /api/oauth/security/identities/{id} - 解除指定第三方绑定
 *
 * 数据核心与网页端 /api/user/identities/{id} 共用（src/lib/security-identities.ts）。
 * 服务端约束：仅本人身份可解绑（越权 404）；占位手机号账号拒绝解绑（需真实手机号）。
 * 要求 scope 含 profile:write；用户级限流 10 次/小时。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { authenticateOAuthUserRequest } from "@/lib/oauth-user-auth";
import { validateCUID } from "@/lib/validation";
import { rateLimit } from "@/lib/ratelimit";
import { unbindSecurityIdentity } from "@/lib/security-identities";
import { apiConsole } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateOAuthUserRequest(request, "DELETE", {
      scope: "profile:write",
      action: "security_identity_unbind",
    });
    if (!auth.ok) return auth.response;
    const { payload, resJson } = auth;

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

    const { id } = await context.params;
    if (!validateCUID(id)) {
      return resJson(
        { success: false, error: { code: "INVALID_ID", message: "非法 ID 格式" } },
        400
      );
    }

    const result = await unbindSecurityIdentity({ userId: payload.id, identityId: id });
    if (!result.ok) {
      return resJson(
        { success: false, error: { code: result.code, message: result.message } },
        result.status
      );
    }

    return resJson({ success: true, data: { message: "已解除绑定" } });
  } catch (error) {
    apiConsole.error("[OAuth Security Identity Unbind] 异常:", error);
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
