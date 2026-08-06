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
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
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

      logAuthEvent("user_logout", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        allDevices,
        ip: getClientIP(request),
      });

      // === SLO：仅当选择“退出所有设备”时才撤销 OAuth 子项目会话并触发 Backchannel Logout ===
      if (allDevices) {
        // 先查询活跃的 OAuthSession（在撤销之前获取 clientId 列表）
        const activeSessions = await prisma.oAuthSession.findMany({
          where: { userId: user.id, revokedAt: null },
          select: { clientId: true },
        });

        // 撤销所有 OAuthSession
        await prisma.oAuthSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        // Backchannel Logout（非阻塞）
        if (activeSessions.length > 0) {
          const clientIds = activeSessions.map((s) => s.clientId);
          await sendBackchannelLogout(user.id, clientIds);
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
