/**
 * OAuth 2.0 Token Introspection 端点
 * POST /api/oauth/introspect
 *
 * 子项目通过此端点验证 access_token 的有效性。
 * 返回 RFC 7662 兼容的 introspection 响应。
 *
 * 认证方式：client_id + client_secret（HTTP Basic Auth 或 POST body）
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { verifyOAuthAccessToken } from "@/lib/jwt";
import { isTokenBlacklisted } from "@/lib/token-blacklist";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流
    const limitResult = await rateLimit(ip, "oauth-introspect");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    // 读取 body
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, string>;

    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = {};
      formData.forEach((v, k) => { body[k] = v.toString(); });
    }

    const client_id = body.client_id;
    const client_secret = body.client_secret;

    if (!client_id || !client_secret) {
      return NextResponse.json(
        { error: "invalid_client" },
        { status: 401 }
      );
    }

    // 验证 client
    const client = await verifyOAuthClientSecret(client_id, client_secret);
    if (!client) {
      recordSsoEvent({
        event: "introspect",
        clientId: client_id,
        ip,
        success: false,
        detail: { reason: "invalid_client" },
      });
      return NextResponse.json(
        { error: "invalid_client" },
        { status: 401 }
      );
    }

    const token = body.token;
    if (!token) {
      return NextResponse.json({ active: false });
    }

    // 验证 token（仅接受 OAuth access_token 类型）
    const payload = await verifyOAuthAccessToken(token);

    if (!payload) {
      recordSsoEvent({
        event: "introspect",
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { active: false, reason: "invalid_token" },
      });

      return NextResponse.json({ active: false });
    }

    // Audience 校验：client 只能 introspect 颁发给自己的 token
    if (payload.client_id !== client_id) {
      recordSsoEvent({
        event: "introspect",
        userId: payload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: false,
        detail: { active: false, reason: "audience_mismatch", tokenAudience: payload.client_id },
      });
      return NextResponse.json({ active: false });
    }

    // 检查黑名单
    const blacklisted = isTokenBlacklisted(payload.id);
    if (blacklisted) {
      recordSsoEvent({
        event: "introspect",
        userId: payload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { active: false, reason: "blacklisted" },
      });
      return NextResponse.json({ active: false });
    }

    recordSsoEvent({
      event: "introspect",
      userId: payload.id,
      clientId: client_id,
      clientName: client.name,
      ip,
      success: true,
      detail: { active: true },
    });

    return NextResponse.json({
      active: true,
      token_type: "Bearer",
      sub: payload.id,
      client_id: payload.client_id,
      scope: payload.scope || "openid",
      exp: payload.exp,
      iat: payload.iat,
      iss: process.env.NEXT_PUBLIC_APP_URL || "https://nihplod.cn",
    });
  } catch (error) {
    apiConsole.error("[OAuth Introspect] 异常:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}
