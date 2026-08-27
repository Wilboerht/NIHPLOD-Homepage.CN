/**
 * 微信小程序 Token 刷新
 * POST /api/auth/wechat/miniprogram-refresh
 *
 * Body: { refreshToken: string }
 *
 * 背景：/api/auth/refresh 仅支持 httpOnly Cookie + CSRF（浏览器通道），
 * 小程序经 miniprogram-login / wechat-bind 拿到的是 JSON body 中的双 Token，
 * 无 Cookie 容器，故提供本端点完成 Refresh Token 轮换。
 *
 * 安全说明：
 * - 复用与浏览器刷新端点一致的原子轮换（atomicallyRotateRefreshToken）与重用检测；
 * - 拒绝携带 client_id 的 OAuth Refresh Token 在内部端点使用；
 * - IP 速率限制 + body 携带令牌通道豁免 CSRF（小程序无浏览器环境）。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { logAuthEvent } from "@/lib/auth-logger";
import { apiConsole } from "@/lib/logger";

const bodySchema = z.object({
  refreshToken: z.string().min(1).max(4096),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  try {
    // 1. 速率限制：IP 维度每 5 分钟最多 10 次刷新（与浏览器刷新端口径一致）
    const ipLimit = await rateLimit(clientIP, "refresh", {
      maxRequests: 10,
      windowMs: 5 * 60 * 1000,
    });
    if (!ipLimit.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOO_MANY_REQUESTS", message: "请求过于频繁，请稍后再试" },
        },
        { status: 429 }
      );
    }

    // 2. 解析 body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_PARAMS", message: "参数错误" } },
        { status: 400 }
      );
    }
    const { refreshToken } = parsed.data;

    // 3. 验证 Refresh Token JWT
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      logAuthEvent("user_refresh_token", {
        success: false,
        reason: "invalid_token",
        ip: clientIP,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_TOKEN", message: "刷新令牌无效或已过期" },
        },
        { status: 401 }
      );
    }

    // refresh token 已不再携带明文手机号 claim，审计日志的 identifier 按 id 查库获取
    // （与浏览器端 /api/auth/refresh 及 logout 路由的既有做法一致）
    const tokenUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { phone: true },
    });
    const userPhone = tokenUser?.phone;

    // 3.1 拒绝携带 client_id 的 OAuth Refresh Token 在内部刷新端点使用
    if (payload.client_id) {
      logAuthEvent("user_refresh_token", {
        userId: payload.id,
        identifier: userPhone,
        success: false,
        reason: "oauth_token_on_internal_endpoint",
        ip: clientIP,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_TOKEN", message: "刷新令牌无效或已过期" },
        },
        { status: 401 }
      );
    }

    // 4. 检查账号状态（封禁/冻结拒绝）
    const statusCheck = await checkUserStatus(payload.id);
    if (!statusCheck.valid) {
      logAuthEvent("user_refresh_token", {
        success: false,
        reason: `account_${statusCheck.status.toLowerCase()}`,
        userId: payload.id,
        identifier: userPhone,
        ip: clientIP,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "ACCOUNT_DISABLED", message: statusCheck.reason || "账号已被禁用" },
        },
        { status: 403 }
      );
    }

    // 5. 签发新双 Token（auth_time 透传，防止 max_age 被新 iat 架空）
    const authTime = payload.auth_time ?? payload.iat;
    const newAccessToken = await signUserToken({
      id: payload.id,
      authTime,
    });
    const newRefreshToken = await signRefreshToken({
      id: payload.id,
      authTime,
    });
    const refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 6. 原子化轮换：查找旧 Token → 校验状态 → 撤销旧 → 保存新（单一事务）
    const rotation = await atomicallyRotateRefreshToken(
      payload.id,
      refreshToken,
      newRefreshToken,
      refreshTokenExpiresAt,
      extractDeviceInfo(request)
    );

    if (!rotation.valid) {
      // Refresh Token 重用检测：与浏览器端点同策略
      if (rotation.reason === "revoked" || rotation.reason === "missing") {
        logAuthEvent("refresh_token_reuse_detected", {
          userId: payload.id,
          identifier: userPhone,
          reason: rotation.reason,
          ip: clientIP,
        });
        await revokeRefreshToken(payload.id);
      }

      logAuthEvent("user_refresh_token", {
        success: false,
        reason: rotation.reason,
        userId: payload.id,
        identifier: userPhone,
        ip: clientIP,
      });
      return NextResponse.json(
        {
          success: false,
          error: { code: "TOKEN_REVOKED", message: "刷新令牌已失效，请重新登录" },
        },
        { status: 401 }
      );
    }

    logAuthEvent("user_refresh_token", {
      success: true,
      userId: payload.id,
      identifier: userPhone,
      ip: clientIP,
    });

    // 7. JSON body 返回新双 Token（小程序无 Cookie 容器）
    return NextResponse.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        accessTokenExpiresAt: getTokenExpiresAt(15),
        refreshTokenExpiresAt: getRefreshTokenExpiresAt(),
      },
    });
  } catch (error) {
    apiConsole.error("[MiniprogramRefresh] 异常:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 }
    );
  }
}
