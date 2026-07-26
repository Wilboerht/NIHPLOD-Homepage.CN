/**
 * 用户登出 API
 * POST /api/auth/logout
 *
 * 安全增强：
 * - 撤销 Refresh Token（使其失效）
 * - 清除两个 Cookie（Access Token 和 Refresh Token）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyUserAuth } from "@/lib/auth";
import { revokeRefreshToken } from "@/lib/auth-security";
import {
  USER_COOKIE_NAME,
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_NAME,
  USER_REFRESH_COOKIE_OPTIONS,
} from "@/types/auth";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!validateCSRFToken(request)) {
    return csrfForbiddenResponse();
  }

  try {
    // 验证用户身份（优先于 body 解析，避免未认证请求触发不必要的 body 解析）
    const user = await verifyUserAuth(request);

    if (user) {
      const body = await request.json().catch(() => ({}));
      const allDevices = body.allDevices === true;

      const refreshToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;

      if (!allDevices && refreshToken) {
        // 仅撤销当前设备的 Refresh Token
        await revokeRefreshToken(user.id, refreshToken);
      } else {
        // 撤销所有 Refresh Token
        await revokeRefreshToken(user.id);
      }

      logAuthEvent("user_logout", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        allDevices,
        ip: getClientIP(request),
      });

      // === SLO: 先查询活跃的 OAuthSession（在撤销之前获取 clientId 列表）===
      const activeSessions = await prisma.oAuthSession.findMany({
        where: { userId: user.id, revokedAt: null },
        select: { clientId: true },
      });

      // === SLO: 撤销所有 OAuthSession ===
      await prisma.oAuthSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // === SLO: Backchannel Logout（非阻塞）===
      // 查询所有已注册且配置了 backchannelLogoutUri 的 client

      if (activeSessions.length > 0) {
        const clientIds = activeSessions.map((s) => s.clientId);
        const clients = await prisma.oAuthClient.findMany({
          where: { clientId: { in: clientIds }, isActive: true, backchannelLogoutUri: { not: null } },
          select: { clientId: true, backchannelLogoutUri: true },
        });

        if (clients.length > 0) {
          const { signLogoutToken } = await import("@/lib/jwt");

          for (const client of clients) {
            if (!client.backchannelLogoutUri) continue;
            try {
              // 为每个 client 生成独立的 jti，避免跨 client 的 jti 碰撞
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
                apiConsole.warn(`[SLO] Backchannel logout 通知失败 (${client.clientId}):`, err);
              });
            } catch (err) {
              apiConsole.warn(`[SLO] Backchannel logout token 签发失败 (${client.clientId}):`, err);
            }
          }
        }
      }
    }

    const response = NextResponse.json({
      success: true,
      data: { message: "已退出登录" },
    });

    // 清除所有认证相关的 Cookies
    response.cookies.set(USER_COOKIE_NAME, "", {
      ...USER_ACCESS_COOKIE_OPTIONS,
      maxAge: 0,
    });
    response.cookies.set(USER_REFRESH_COOKIE_NAME, "", {
      ...USER_REFRESH_COOKIE_OPTIONS,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    apiConsole.error("[Logout] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "登出失败",
        },
      },
      { status: 500 }
    );
  }
}
