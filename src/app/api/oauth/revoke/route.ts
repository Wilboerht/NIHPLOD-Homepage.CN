/**
 * OAuth 2.0 Token Revocation 端点
 * POST /api/oauth/revoke
 *
 * RFC 7009 兼容的 Token 撤销端点。
 * 子项目登出时调用此端点撤销 refresh_token，
 * 使其无法再用于刷新 access_token。
 *
 * 认证方式：
 * - client_secret_basic: Authorization: Basic base64(client_id:client_secret)
 * - client_secret_post: 请求体中 client_id + client_secret
 * - Public Client：仅 client_id（RFC 7009 允许 Public Client 不携带 secret）
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { getClientCredentials } from "@/lib/oauth-client-auth";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { verifyRefreshToken, verifyOAuthAccessToken } from "@/lib/jwt";
import { revokeRefreshToken } from "@/lib/auth-security";
import { revokeAccessToken } from "@/lib/token-blacklist";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { prisma } from "@/lib/prisma";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const corsHeaders = await getOAuthCorsHeaders(request);
  const resJson = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      // RFC 7009 §2.2：撤销响应不得被缓存
      headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...corsHeaders },
    });

  try {
    // 限流
    const limitResult = await rateLimit(ip, "oauth-revoke");
    if (!limitResult.success) {
      return resJson({ error: "rate_limited", error_description: "请求过于频繁" }, 429);
    }

    // 读取 body（支持 JSON 和 form-urlencoded）
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, string>;

    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        return resJson(
          { error: "invalid_request", error_description: "请求体不是合法的 JSON" },
          400
        );
      }
    } else {
      const formData = await request.formData();
      body = {};
      formData.forEach((v, k) => {
        body[k] = v.toString();
      });
    }

    const { client_id, client_secret } = getClientCredentials(request, body);
    const token = body.token;
    const token_type_hint = body.token_type_hint;

    if (!client_id) {
      return resJson({ error: "invalid_client", error_description: "缺少 client_id" }, 401);
    }

    if (!token) {
      // RFC 7009: 即使 token 不存在也返回 200（防止信息泄漏）
      return resJson({});
    }

    // 验证 client：Public Client 允许不传 secret；Confidential Client 必须验证 secret
    const verifyResult = await verifyOAuthClientSecret(client_id, client_secret, {
      allowPublic: true,
    });
    if (!verifyResult.client) {
      scheduleSsoEvent({
        event: "logout",
        clientId: client_id,
        ip,
        success: false,
        detail: { reason: verifyResult.reason, action: "revoke" },
      });
      return resJson({ error: "invalid_client", error_description: "Client 认证失败" }, 401);
    }
    const client = verifyResult.client;

    // RFC 7009 §2.1：token_type_hint 仅为提示。先尝试 hint 指定的类型，
    // 与实际类型不符（验签失败）时交叉尝试另一类型。
    // 返回 true 表示 token 已被识别为该类型（无论所有权校验/撤销结果如何）
    const tryRevokeRefreshToken = async (): Promise<boolean> => {
      // 验证 JWT 签名以获取 userId
      const refreshPayload = await verifyRefreshToken(token);
      if (!refreshPayload) return false;

      // 所有权校验：OAuth refresh token 携带 client_id 时，必须与本请求 client_id 一致
      if (refreshPayload.client_id && refreshPayload.client_id !== client_id) {
        scheduleSsoEvent({
          event: "logout",
          userId: refreshPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { token_type: "refresh_token", action: "revoke", reason: "client_id_mismatch" },
        });
        return true;
      }

      // 无 client_id 的内部 refresh token 不应在 OAuth revoke 端点处理
      if (!refreshPayload.client_id) {
        return true;
      }

      // 使用 auth-security 的 revokeRefreshToken 撤销（自动处理 SHA-256 哈希比对）
      const revokedCount = await revokeRefreshToken(refreshPayload.id, token);

      // 同步撤销该 user+client 对应的 OAuthSession（登出后会话一并失效）
      await prisma.oAuthSession.updateMany({
        where: { userId: refreshPayload.id, clientId: client_id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      scheduleSsoEvent({
        event: "logout",
        userId: refreshPayload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { token_type: "refresh_token", action: "revoke", revokedCount },
      });
      return true;
    };

    const tryRevokeAccessToken = async (): Promise<boolean> => {
      const accessPayload = await verifyOAuthAccessToken(token);
      if (!accessPayload) return false;

      // 所有权校验：client 只能撤销颁发给自己的 access_token
      if (accessPayload.client_id !== client_id) {
        scheduleSsoEvent({
          event: "logout",
          userId: accessPayload.id,
          clientId: client_id,
          clientName: client.name,
          ip,
          success: false,
          detail: { token_type: "access_token", action: "revoke", reason: "audience_mismatch" },
        });
        return true;
      }
      if (accessPayload.jti) {
        await revokeAccessToken(accessPayload.jti);
      }
      scheduleSsoEvent({
        event: "logout",
        userId: accessPayload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { token_type: "access_token", action: "revoke", jti: accessPayload.jti },
      });
      return true;
    };

    if (token_type_hint === "access_token") {
      if (!(await tryRevokeAccessToken())) await tryRevokeRefreshToken();
    } else {
      // 默认（含 hint=refresh_token）优先按 refresh_token 处理
      if (!(await tryRevokeRefreshToken())) await tryRevokeAccessToken();
    }

    // RFC 7009: 无论 token 是否有效，总是返回 200
    return resJson({});
  } catch (error) {
    apiConsole.error("[OAuth Revoke] 未预期异常:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 3).join("\n") : undefined,
    });
    // RFC 7009: 即使出错也返回 200，但记录详细日志用于排查
    return resJson({});
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
