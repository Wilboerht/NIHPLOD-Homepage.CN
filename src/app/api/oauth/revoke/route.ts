/**
 * OAuth 2.0 Token Revocation 端点
 * POST /api/oauth/revoke
 *
 * RFC 7009 兼容的 Token 撤销端点。
 * 子项目登出时调用此端点撤销 refresh_token，
 * 使其无法再用于刷新 access_token。
 *
 * 认证方式：client_id + client_secret
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { verifyRefreshToken, verifyOAuthAccessToken } from "@/lib/jwt";
import { revokeRefreshToken } from "@/lib/auth-security";
import { revokeAccessToken } from "@/lib/token-blacklist";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流
    const limitResult = await rateLimit(ip, "oauth-revoke");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    // 读取 body（支持 JSON 和 form-urlencoded）
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
    const token = body.token;
    const token_type_hint = body.token_type_hint;

    if (!client_id || !client_secret) {
      return NextResponse.json(
        { error: "invalid_client", error_description: "缺少 client_id 或 client_secret" },
        { status: 401 }
      );
    }

    if (!token) {
      // RFC 7009: 即使 token 不存在也返回 200（防止信息泄漏）
      return NextResponse.json({});
    }

    // 验证 client
    const client = await verifyOAuthClientSecret(client_id, client_secret);
    if (!client) {
      recordSsoEvent({
        event: "logout",
        clientId: client_id,
        ip,
        success: false,
        detail: { reason: "invalid_client", action: "revoke" },
      });
      return NextResponse.json(
        { error: "invalid_client", error_description: "Client 认证失败" },
        { status: 401 }
      );
    }

    // 如果 hint 是 refresh_token 或未指定，尝试撤销 refresh_token
    if (!token_type_hint || token_type_hint === "refresh_token") {
      // 验证 JWT 签名以获取 userId
      const refreshPayload = await verifyRefreshToken(token);

      if (refreshPayload) {
        // 使用 auth-security 的 revokeRefreshToken 撤销（自动处理 SHA-256 哈希比对）
        const revokedCount = await revokeRefreshToken(refreshPayload.id, token);

        recordSsoEvent({
          event: "logout",
          userId: refreshPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: true,
          detail: { token_type: "refresh_token", action: "revoke", revokedCount },
        });
      }
    }

    // 如果 hint 是 access_token，验证 token 并把 jti 加入撤销列表
    if (token_type_hint === "access_token") {
      const accessPayload = await verifyOAuthAccessToken(token);
      if (accessPayload) {
        // 所有权校验：client 只能撤销颁发给自己的 access_token
        if (accessPayload.client_id !== client_id) {
          recordSsoEvent({
            event: "logout",
            userId: accessPayload.id,
            clientId: client_id,
            clientName: client.name,
            ip,
            success: false,
            detail: { token_type: "access_token", action: "revoke", reason: "audience_mismatch" },
          });
          return NextResponse.json({});
        }
        if (accessPayload.jti) {
          revokeAccessToken(accessPayload.jti);
        }
        recordSsoEvent({
          event: "logout",
          userId: accessPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: true,
          detail: { token_type: "access_token", action: "revoke", jti: accessPayload.jti },
        });
      }
    }

    // RFC 7009: 无论 token 是否有效，总是返回 200
    return NextResponse.json({});
  } catch (error) {
    apiConsole.error("[OAuth Revoke] 异常:", error);
    // RFC 7009: 即使出错也返回 200（除非是 client 认证失败）
    return NextResponse.json({});
  }
}
