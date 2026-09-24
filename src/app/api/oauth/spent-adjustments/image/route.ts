/**
 * OAuth 2.0 消费补录凭证图片端点
 * GET /api/oauth/spent-adjustments/image?key=<objectName>
 *
 * 仅允许凭证所属用户查看：验证 token 归属 + 申请归属后，302 重定向到
 * 私有 bucket 的短时效签名 URL。要求 scope 含 membership。
 * 归属校验与签名逻辑与主站会话路由共用（src/lib/spent-adjustment-files.ts）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { authenticateOAuthResourceRequest, isM2mPayload } from "@/lib/oauth-resource-auth";
import { guardOAuthUserActive } from "@/lib/oauth-user-guard";
import { resolveSpentProofImage } from "@/lib/spent-adjustment-files";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateOAuthResourceRequest(request, "GET");
    if (!auth.ok) return auth.response;
    const { payload, ip, resJson } = auth;

    if (isM2mPayload(payload)) {
      return resJson(
        { error: "invalid_request", error_description: "client_credentials token 无用户身份" },
        403
      );
    }

    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    if (!scopes.includes("membership")) {
      scheduleSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { action: "spent_adjustments_image", reason: "insufficient_scope" },
      });
      return resJson(
        { error: "insufficient_scope", error_description: "需要 membership scope" },
        403,
        { "WWW-Authenticate": 'Bearer error="insufficient_scope", scope="membership"' }
      );
    }

    const guard = await guardOAuthUserActive(payload.id);
    if (!guard.ok) {
      return resJson({ error: guard.error, error_description: guard.errorDescription }, guard.status);
    }

    const key = request.nextUrl.searchParams.get("key") ?? "";
    const result = await resolveSpentProofImage(payload.id, key);

    if (!result.ok) {
      return resJson({ error: result.code, error_description: result.message }, result.status);
    }

    // 302 同样带 CORS 与 no-store：浏览器脚本 fetch 跟随重定向时需要放行头，
    // 且签名地址不应被中间缓存
    const redirect = NextResponse.redirect(result.signedUrl, 302);
    const corsHeaders = await getOAuthCorsHeaders(request);
    for (const [name, value] of Object.entries(corsHeaders)) {
      redirect.headers.set(name, value);
    }
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  } catch (error) {
    apiConsole.error("[OAuth SpentAdjustments] 凭证图片访问失败:", error);
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
