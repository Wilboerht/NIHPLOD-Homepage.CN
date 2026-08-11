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
import { rateLimit } from "@/lib/ratelimit";
import { apiConsole } from "@/lib/logger";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";
import { revokeRefreshToken } from "@/lib/auth-security";
import { blacklistUserTokens } from "@/lib/token-blacklist";
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

    // 用户级限流（参照 checkAdminRateLimit 模式）：撤销操作会触发级联写与外部通知，防止滥用
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

    // 撤销用户同意记录，防止下次授权时 auto-consent 跳过同意页
    await prisma.userConsent.updateMany({
      where: { userId: user.id, clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 同步撤销该 client 对应的所有 Refresh Token，防止旧 refresh_token 继续换发 access_token
    await revokeRefreshToken(user.id, undefined, clientId);

    // 联动拉黑已签发的 access token，消除 15 分钟有效窗口（与 client 删除路径一致）
    await blacklistUserTokens(user.id, "oauth_consent_revoked").catch(() => {});

    // 记录审计日志（合规敏感，同步等待写入）
    await recordSsoEvent({
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
    await sendBackchannelLogout(user.id, [clientId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    apiConsole.error("[OAuth Revoke] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
