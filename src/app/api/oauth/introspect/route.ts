/**
 * OAuth 2.0 Token Introspection 端点
 * POST /api/oauth/introspect
 *
 * 子项目通过此端点验证 access_token 的有效性。
 * 返回 RFC 7662 兼容的 introspection 响应。
 *
 * 认证方式：
 * - client_secret_basic: Authorization: Basic base64(client_id:client_secret)
 * - client_secret_post: 请求体中 client_id + client_secret
 * - Public Client：仅 client_id（用于无 secret 的浏览器/移动端场景）
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { getClientCredentials } from "@/lib/oauth-client-auth";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { verifyOAuthAccessToken } from "@/lib/jwt";
import { isTokenBlacklisted, isAccessTokenRevoked } from "@/lib/token-blacklist";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const corsHeaders = await getOAuthCorsHeaders(request);
    const resJson = (body: unknown, status = 200) =>
      NextResponse.json(body, { status, headers: corsHeaders });

    // 限流
    const limitResult = await rateLimit(ip, "oauth-introspect");
    if (!limitResult.success) {
      return resJson(
        { error: "rate_limited", error_description: "请求过于频繁" },
        429
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

    const { client_id, client_secret } = getClientCredentials(request, body);

    if (!client_id) {
      return resJson({ error: "invalid_client" }, 401);
    }

    // 验证 client：Public Client 允许不传 secret
    const client = await verifyOAuthClientSecret(client_id, client_secret, { allowPublic: true });
    if (!client) {
      recordSsoEvent({
        event: "introspect",
        clientId: client_id,
        ip,
        success: false,
        detail: { reason: "invalid_client" },
      });
      return resJson({ error: "invalid_client" }, 401);
    }

    const token = body.token;
    if (!token) {
      return resJson({ active: false });
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

      return resJson({ active: false });
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
      return resJson({ active: false });
    }

    // 检查黑名单
    const blacklisted = await isTokenBlacklisted(payload.id);
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
      return resJson({ active: false });
    }

    // 检查 JTI 级令牌撤销
    if (payload.jti && await isAccessTokenRevoked(payload.jti as string)) {
      recordSsoEvent({
        event: "introspect",
        userId: payload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { active: false, reason: "token_revoked" },
      });
      return resJson({ active: false });
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

    return resJson({
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

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
