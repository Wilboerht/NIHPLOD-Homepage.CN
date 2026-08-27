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
import { verifyRefreshToken } from "@/lib/jwt";
import { revokeRefreshToken } from "@/lib/auth-security";
import { revokeAccessToken } from "@/lib/token-blacklist";
import {
  USER_COOKIE_NAME,
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_NAME,
  USER_REFRESH_COOKIE_OPTIONS,
} from "@/types/auth";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { validateCSRFToken, csrfForbiddenResponse, CSRF_COOKIE_NAME } from "@/lib/csrf";
import { prisma } from "@/lib/prisma";
import { sendBackchannelLogout } from "@/lib/backchannel-logout";

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

      // 撤销当前 access token 的 jti（防止登出后仍被使用）
      if (user.jti) {
        await revokeAccessToken(user.jti);
      }

      // access token 已不再携带明文手机号，审计日志的 identifier 按 id 查库获取
      const userRecord = await prisma.user.findUnique({
        where: { id: user.id },
        select: { phone: true },
      });

      logAuthEvent("user_logout", {
        userId: user.id,
        identifier: userRecord?.phone,
        success: true,
        allDevices,
        ip: getClientIP(request),
      });

      // 查询活跃 OAuthSession 并触发 Backchannel Logout
      // 单设备登出：仅通知当前设备关联的 OAuth client；全设备登出：通知所有活跃 client
      const activeSessions = await prisma.oAuthSession.findMany({
        where: { userId: user.id, revokedAt: null },
        select: { clientId: true },
      });

      if (activeSessions.length > 0) {
        if (!allDevices && refreshToken) {
          const { createHash } = await import("crypto");
          const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
          const refreshRecord = await prisma.refreshToken.findFirst({
            where: { userId: user.id, token: tokenHash },
            select: { clientId: true },
          });
          const targetClientId = refreshRecord?.clientId;
          if (targetClientId) {
            // 先发送 Backchannel Logout（需要活跃 session 的 sid），再撤销 session
            await sendBackchannelLogout(user.id, [targetClientId]);
            await prisma.oAuthSession.updateMany({
              where: { userId: user.id, clientId: targetClientId, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
          // 当前会话无关联 OAuth client（普通浏览器登录，clientId=null）：
          // 单设备登出不触碰其他客户端的第三方授权会话；仅 allDevices 时才全量广播
        } else {
          const clientIds = [...new Set(activeSessions.map((s) => s.clientId))];
          await sendBackchannelLogout(user.id, clientIds);
          await prisma.oAuthSession.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
    } else {
      // access token 已失效（过期/撤销）但 refresh cookie 仍存在：
      // 仍应撤销该 refresh token，否则"登出"后旧 refresh token 还能换新 access token。
      // 此处不记录成功审计（用户身份未经有效 access token 确认），
      // 任何失败都不阻断后续清 Cookie，保持登出幂等。
      const refreshToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
      if (refreshToken) {
        try {
          const refreshPayload = await verifyRefreshToken(refreshToken);
          if (refreshPayload) {
            // DB 哈希比对定位该 refresh token（与上方已认证路径的单设备撤销同口径）
            const { createHash } = await import("crypto");
            const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
            const refreshRecord = await prisma.refreshToken.findFirst({
              where: { userId: refreshPayload.id, token: tokenHash, revokedAt: null },
              select: { clientId: true },
            });
            if (refreshRecord) {
              await revokeRefreshToken(refreshPayload.id, refreshToken);
              // 关联 OAuthSession 一并撤销（与已认证路径的单设备登出口径一致）
              if (refreshRecord.clientId) {
                await sendBackchannelLogout(refreshPayload.id, [refreshRecord.clientId]);
                await prisma.oAuthSession.updateMany({
                  where: {
                    userId: refreshPayload.id,
                    clientId: refreshRecord.clientId,
                    revokedAt: null,
                  },
                  data: { revokedAt: new Date() },
                });
              }
            }
          }
        } catch (revokeError) {
          // 撤销失败不阻断登出：Cookie 仍会清除，保持幂等
          apiConsole.warn("[Logout] access token 失效时的 refresh token 撤销失败:", revokeError);
        }
      }
    }

    // 构建响应：未登录用户仍返回成功（幂等登出），不区分是否曾登录防止信息泄漏
    const response = NextResponse.json({
      success: true,
      data: {
        message: "已退出登录",
      },
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
    response.cookies.set(CSRF_COOKIE_NAME, "", {
      httpOnly: false,
      secure: true,
      sameSite: "strict" as const,
      path: "/",
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
