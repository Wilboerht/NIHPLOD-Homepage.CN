/**
 * OAuth 2.0 UserInfo 端点
 * GET /api/oauth/userinfo
 *
 * 返回当前 Access Token 对应的用户信息。
 * 按 token 中的 scope claim 裁剪返回字段。
 * 敏感字段（phone）进行脱敏处理。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthAccessToken } from "@/lib/jwt";
import { isTokenBlacklisted } from "@/lib/token-blacklist";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { maskPhone } from "@/lib/mask-phone";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流
    const limitResult = await rateLimit(ip, "oauth-userinfo");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    // 从 Authorization header 提取 token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "invalid_token", error_description: "缺少 Authorization header" },
        {
          status: 401,
          headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
        }
      );
    }

    const token = authHeader.slice(7);

    // 验证 access token
    const payload = await verifyOAuthAccessToken(token);
    if (!payload) {
      recordSsoEvent({
        event: "userinfo",
        ip,
        success: false,
        detail: { reason: "invalid_token" },
      });
      return NextResponse.json(
        { error: "invalid_token", error_description: "Access token 无效或已过期" },
        {
          status: 401,
          headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
        }
      );
    }

    // 检查 access token 黑名单（封禁后 15 分钟窗口期内的 token）
    const blacklisted = isTokenBlacklisted(payload.id);
    if (blacklisted) {
      recordSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { reason: "blacklisted", blacklistReason: blacklisted.reason },
      });
      return NextResponse.json(
        { error: "account_disabled", error_description: "账户已被限制" },
        { status: 403 }
      );
    }

    // 从数据库获取最新用户信息
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        phone: true,
        nickname: true,
        avatar: true,
        status: true,
        membershipLevel: true,
        totalPoints: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      recordSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { reason: "account_disabled" },
      });
      return NextResponse.json(
        { error: "account_disabled", error_description: "账户已被封禁或冻结" },
        { status: 403 }
      );
    }

    // 按 scope 裁剪返回字段
    const scopes = (payload.scope || "").split(" ").filter(Boolean);
    const response: Record<string, unknown> = {
      sub: user.id,
    };

    if (scopes.includes("profile")) {
      response.nickname = user.nickname;
      response.avatar = user.avatar;
    }

    if (scopes.includes("phone")) {
      response.phone = maskPhone(user.phone);
    }

    if (scopes.includes("membership")) {
      response.membership_level = user.membershipLevel;
      response.total_points = user.totalPoints;
    }

    recordSsoEvent({
      event: "userinfo",
      userId: payload.id,
      clientId: payload.client_id,
      ip,
      success: true,
    });

    return NextResponse.json(response);
  } catch (error) {
    apiConsole.error("[OAuth UserInfo] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}
