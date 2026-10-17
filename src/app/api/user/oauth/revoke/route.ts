/**
 * OAuth 授权撤销端点
 * POST /api/user/oauth/revoke
 *
 * 用户主动撤销对某个子项目的授权。
 * 撤销后该 client 的所有 OAuthSession 将被标记为已撤销，
 * 并触发 Backchannel Logout 通知该 client。
 * 数据核心与 OAuth 端点（/api/oauth/security/authorizations/{clientId}）共用：
 * src/lib/security-authorizations.ts。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { getClientIP } from "@/lib/client-ip";
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { revokeSecurityAuthorization } from "@/lib/security-authorizations";

export const dynamic = "force-dynamic";

const revokeSchema = z.object({
  clientId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    const user = await verifyUserAuth(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "请先登录" } },
        { status: 401 }
      );
    }

    // 用户级限流：撤销操作会触发级联写与外部通知，防止滥用
    const limitResult = await rateLimit(`oauth-revoke:${user.id}`, "default", {
      maxRequests: 10,
      windowMs: 60 * 1000,
    });
    if (!limitResult.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "操作过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const result = await revokeSecurityAuthorization({
      userId: user.id,
      clientId: parsed.data.clientId,
      ip: getClientIP(request),
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    apiConsole.error("[OAuth Revoke] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
