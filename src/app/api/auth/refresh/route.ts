/**
 * Token 刷新 API
 * POST /api/auth/refresh
 *
 * 使用 Refresh Token 获取新的 Access Token
 * 当 Access Token 过期时调用此接口
 *
 * 安全说明：Refresh Token 必须从 httpOnly Cookie 中读取，
 * 不再接受请求 body 中的 refreshToken 参数。
 *
 * 核心刷新事务（验 refresh → 状态检查 → 原子轮换 → 签新双 token）已抽取至
 * @/lib/session-refresh 的 refreshUserSession，供 OAuth authorize 透明刷新复用；
 * 本路由仅保留路由层职责：限流、CSRF、Cookie 读写与 HTTP 响应映射。
 */
import { NextRequest, NextResponse } from "next/server";
import { getTokenExpiresAt, getRefreshTokenExpiresAt } from "@/lib/jwt";
import { extractDeviceInfo } from "@/lib/auth-security";
import { refreshUserSession } from "@/lib/session-refresh";
import {
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
} from "@/types/auth";
import { apiConsole } from "@/lib/logger";
import { logAuthEvent } from "@/lib/auth-logger";
import { getClientIP } from "@/lib/client-ip";
import { rateLimit } from "@/lib/ratelimit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. 速率限制：IP 维度每 5 分钟最多 10 次刷新
    const ip = getClientIP(request);
    const ipLimit = await rateLimit(ip, "refresh", { maxRequests: 10, windowMs: 5 * 60 * 1000 });
    if (!ipLimit.success) {
      return NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" } },
        { status: 429 }
      );
    }

    // 0. CSRF 校验：防止跨站请求伪造
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    // 2. 从 httpOnly Cookie 中读取 Refresh Token
    const refreshToken = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;

    if (!refreshToken) {
      logAuthEvent("user_refresh_token", {
        success: false,
        reason: "missing_refresh_token",
        ip: getClientIP(request),
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_REFRESH_TOKEN",
            message: "未找到 Refresh Token，请重新登录",
          },
        },
        { status: 401 }
      );
    }

    // 3. 核心刷新事务（JWT 验证 → OAuth token 拒绝 → 账号状态 → 原子轮换 → 重签）
    const result = await refreshUserSession(refreshToken, {
      ip: getClientIP(request),
      deviceInfo: extractDeviceInfo(request),
    });

    // 4. 失败原因 → HTTP 响应映射（行为与重构前一致）
    if (!result.success) {
      switch (result.reason) {
        case "invalid_token":
        case "oauth_token":
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "INVALID_TOKEN",
                message: "刷新令牌无效或已过期",
              },
            },
            { status: 401 }
          );
        case "account_disabled":
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "ACCOUNT_DISABLED",
                message: result.statusReason || "账号已被禁用",
              },
            },
            { status: 403 }
          );
        default:
          // 轮换失败（revoked / missing / expired / concurrent_rotation / error 等）
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "TOKEN_REVOKED",
                message: "刷新令牌已失效，请重新登录",
              },
            },
            { status: 401 }
          );
      }
    }

    // 5. 构建响应（不再在 body 中返回 Token，仅返回过期时间等元数据）
    const response = NextResponse.json({
      success: true,
      data: {
        accessTokenExpiresAt: getTokenExpiresAt(120), // 2小时
        refreshTokenExpiresAt: getRefreshTokenExpiresAt(), // 30天
      },
    });

    // 6. 更新 Cookie 中的双 Token
    response.cookies.set(USER_COOKIE_NAME, result.accessToken, USER_ACCESS_COOKIE_OPTIONS);
    response.cookies.set(USER_REFRESH_COOKIE_NAME, result.refreshToken, USER_REFRESH_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    apiConsole.error("[RefreshToken] 异常:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "服务器错误",
        },
      },
      { status: 500 }
    );
  }
}
