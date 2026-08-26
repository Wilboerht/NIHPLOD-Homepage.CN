/**
 * Token 刷新 API
 * POST /api/auth/refresh
 *
 * 使用 Refresh Token 获取新的 Access Token
 * 当 Access Token 过期时调用此接口
 *
 * 安全说明：Refresh Token 必须从 httpOnly Cookie 中读取，
 * 不再接受请求 body 中的 refreshToken 参数。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  verifyRefreshToken,
  signUserToken,
  signRefreshToken,
  getTokenExpiresAt,
  getRefreshTokenExpiresAt,
} from "@/lib/jwt";
import {
  atomicallyRotateRefreshToken,
  revokeRefreshToken,
  extractDeviceInfo,
} from "@/lib/auth-security";
import { checkUserStatus } from "@/lib/auth";
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

    // 3. 验证 Refresh Token JWT
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      logAuthEvent("user_refresh_token", {
        success: false,
        reason: "invalid_token",
        ip: getClientIP(request),
      });
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
    }

    // 3.1 拒绝携带 client_id 的 OAuth Refresh Token 在内部刷新端点使用
    if (payload.client_id) {
      logAuthEvent("user_refresh_token", {
        userId: payload.id,
        identifier: payload.phone,
        success: false,
        reason: "oauth_token_on_internal_endpoint",
        ip: getClientIP(request),
      });
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
    }

    // 4. 检查账号状态
    const statusCheck = await checkUserStatus(payload.id);
    if (!statusCheck.valid) {
      logAuthEvent("user_refresh_token", {
        success: false,
        reason: `account_${statusCheck.status.toLowerCase()}`,
        userId: payload.id,
        identifier: payload.phone,
        ip: getClientIP(request),
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "ACCOUNT_DISABLED",
            message: statusCheck.reason || "账号已被禁用",
          },
        },
        { status: 403 }
      );
    }

    // 5. 签发新双 Token（先签发，后续在原子事务中与旧 Token 一起处理）
    // 原始认证时间固化：优先透传旧 token 的 auth_time；首次换发时以旧 refresh token 的
    // iat（登录时刻）为准写入 auth_time，后续换发不再重置，防止 max_age 被新 iat 架空
    const authTime = payload.auth_time ?? payload.iat;
    const newAccessToken = await signUserToken({
      id: payload.id,
      authTime,
    });
    const newRefreshToken = await signRefreshToken({
      id: payload.id,
      phone: payload.phone,
      authTime,
    });
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 6. 原子化验证旧 Token 并轮换新 Token
    //    在单一 DB 事务中完成：查找旧 Token → 校验状态 → 撤销旧 → 保存新
    //    消除 validate + revoke + save 之间的 Race Condition 窗口
    const rotation = await atomicallyRotateRefreshToken(
      payload.id,
      refreshToken,
      newRefreshToken,
      refreshTokenExpiresAt,
      extractDeviceInfo(request)
    );

    if (!rotation.valid) {
      // Refresh Token 重用检测：仅对 revoked/missing 执行全量撤销（安全的 token 泄漏信号）
      // concurrent_rotation 是正常并发场景，不撤销所有设备（避免多 Tab 误伤）
      if (rotation.reason === "revoked" || rotation.reason === "missing") {
        logAuthEvent("refresh_token_reuse_detected", {
          userId: payload.id,
          identifier: payload.phone,
          reason: rotation.reason,
          ip: getClientIP(request),
        });
        await revokeRefreshToken(payload.id);
      }

      logAuthEvent("user_refresh_token", {
        success: false,
        reason: rotation.reason,
        userId: payload.id,
        identifier: payload.phone,
        ip: getClientIP(request),
      });
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

    // 7. 构建响应（不再在 body 中返回 Token，仅返回过期时间等元数据）
    const response = NextResponse.json({
      success: true,
      data: {
        accessTokenExpiresAt: getTokenExpiresAt(15), // 15分钟
        refreshTokenExpiresAt: getRefreshTokenExpiresAt(), // 30天
      },
    });

    // 8. 更新 Cookie 中的双 Token
    response.cookies.set(USER_COOKIE_NAME, newAccessToken, USER_ACCESS_COOKIE_OPTIONS);
    response.cookies.set(USER_REFRESH_COOKIE_NAME, newRefreshToken, USER_REFRESH_COOKIE_OPTIONS);

    logAuthEvent("user_refresh_token", {
      userId: payload.id,
      identifier: payload.phone,
      success: true,
      ip: getClientIP(request),
    });

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
