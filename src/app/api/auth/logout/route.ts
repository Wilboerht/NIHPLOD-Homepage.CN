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
  USER_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_NAME,
} from "@/types/auth";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";

// 强制动态渲染，禁止静态预渲染
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 验证用户身份
    const user = await verifyUserAuth(request);
    
    if (user) {
      // 撤销所有 Refresh Token（使用户的所有 token 失效）
      await revokeRefreshToken(user.id);
      logAuthEvent("user_logout", {
        userId: user.id,
        identifier: user.phone,
        success: true,
        ip: getClientIP(request),
      });
    }

    const response = NextResponse.json({
      success: true,
      data: { message: "已退出登录" },
    });

    // 清除所有认证相关的 Cookies
    response.cookies.set(USER_COOKIE_NAME, "", {
      ...USER_COOKIE_OPTIONS,
      maxAge: 0, // 立即过期
    });
    response.cookies.set(USER_REFRESH_COOKIE_NAME, "", {
      ...USER_COOKIE_OPTIONS,
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

