/**
 * OAuth 授权撤销端点
 * POST /api/user/oauth/revoke
 *
 * 用户主动撤销对某个子项目的授权。
 * 撤销后该 client 的所有 OAuthSession 将被标记为已撤销，
 * 并触发 Backchannel Logout 通知该 client。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { recordSsoEvent } from "@/lib/sso-audit";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { apiConsole } from "@/lib/logger";
import { z } from "zod";

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

    const body = await request.json();
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }

    const { clientId } = parsed.data;
    const ip = getClientIP(request);

    // 查找该 client 的活跃 session
    const activeSessions = await prisma.oAuthSession.findMany({
      where: { userId: user.id, clientId, revokedAt: null },
      select: { id: true, sessionId: true },
    });

    if (activeSessions.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "未找到该授权记录" } },
        { status: 404 }
      );
    }

    // 撤销该 client 的所有 OAuthSession
    await prisma.oAuthSession.updateMany({
      where: { userId: user.id, clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 记录审计日志
    recordSsoEvent({
      event: "consent",
      userId: user.id,
      clientId,
      ip,
      success: true,
      detail: { action: "revoke", sessionCount: activeSessions.length },
    });

    logAuthEvent("user_oauth_revoke", {
      userId: user.id,
      identifier: user.phone,
      success: true,
      clientId,
      ip,
    });

    // 触发 Backchannel Logout（非阻塞）
    const client = await prisma.oAuthClient.findFirst({
      where: { clientId, isActive: true, backchannelLogoutUri: { not: null } },
      select: { clientId: true, backchannelLogoutUri: true },
    });

    if (client?.backchannelLogoutUri) {
      try {
        const { signLogoutToken } = await import("@/lib/jwt");
        const jti = crypto.randomUUID();
        const logoutToken = await signLogoutToken({
          sub: user.id,
          aud: client.clientId,
          events: "http://schemas.openid.net/event/backchannel-logout",
          jti,
        });

        fetch(client.backchannelLogoutUri, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ logout_token: logoutToken }),
          signal: AbortSignal.timeout(5000),
        }).catch((err) => {
          apiConsole.warn(`[OAuth Revoke] Backchannel logout 通知失败 (${clientId}):`, err);
        });
      } catch (err) {
        apiConsole.warn(`[OAuth Revoke] Backchannel logout token 签发失败 (${clientId}):`, err);
      }
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
