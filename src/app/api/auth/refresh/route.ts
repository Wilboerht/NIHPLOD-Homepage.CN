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
import { verifyRefreshToken, signUserToken, signRefreshToken, getTokenExpiresAt, getRefreshTokenExpiresAt } from "@/lib/jwt";
import { validateAndRefreshToken, saveRefreshToken, revokeRefreshToken, extractDeviceInfo } from "@/lib/auth-security";
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

// 强制动态渲染，禁止静态预渲染
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. 从 httpOnly Cookie 中读取 Refresh Token
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

    // 2. 验证 Refresh Token JWT
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

    // 3. 检查账号状态
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

    // 4. 检查 Refresh Token 是否在数据库中有效（未被撤销）
    const validation = await validateAndRefreshToken(payload.id, refreshToken);
    if (!validation.valid) {
      // Refresh Token 重用检测：签名有效但数据库中不存在或已被撤销，说明可能被盗用
      if (validation.reason === "revoked" || validation.reason === "missing") {
        logAuthEvent("refresh_token_reuse_detected", {
          userId: payload.id,
          identifier: payload.phone,
          reason: validation.reason,
          ip: getClientIP(request),
        });
        // 撤销该用户所有未过期 Refresh Token，强制所有设备重新登录
        await revokeRefreshToken(payload.id);
      }

      logAuthEvent("user_refresh_token", {
        success: false,
        reason: validation.reason,
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

    // 5. Refresh Token Rotation：删除旧 Token，签发新双 Token
    const revokedCount = await revokeRefreshToken(payload.id, refreshToken);
    if (revokedCount === 0) {
      // 并发刷新场景：旧 Token 已被其他请求撤销，当前请求视为潜在重用
      logAuthEvent("refresh_token_reuse_detected", {
        userId: payload.id,
        identifier: payload.phone,
        reason: "concurrent_rotation",
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

    const newAccessToken = await signUserToken({
      id: payload.id,
      phone: payload.phone,
    });
    const newRefreshToken = await signRefreshToken({
      id: payload.id,
      phone: payload.phone,
    });

    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await saveRefreshToken(payload.id, newRefreshToken, refreshTokenExpiresAt, extractDeviceInfo(request));

    // 6. 构建响应（不再在 body 中返回 Token，仅返回过期时间等元数据）
    const response = NextResponse.json({
      success: true,
      data: {
        accessTokenExpiresAt: getTokenExpiresAt(15), // 15分钟
        refreshTokenExpiresAt: getRefreshTokenExpiresAt(), // 30天
      },
    });

    // 7. 更新 Cookie 中的双 Token
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
