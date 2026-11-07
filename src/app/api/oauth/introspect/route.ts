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
import { getIssuer } from "@/lib/oauth-constants";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { BODY_LIMITS } from "@/lib/body-limits";
import {
  isBodyTooLargeError,
  payloadTooLargeResponse,
  readFormDataBody,
  readJsonBody,
} from "@/lib/request-body";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const corsHeaders = await getOAuthCorsHeaders(request);
    const resJson = (body: unknown, status = 200) =>
      NextResponse.json(body, {
        status,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      });

    // 限流
    const limitResult = await rateLimit(ip, "oauth-introspect");
    if (!limitResult.success) {
      return resJson({ error: "rate_limited", error_description: "请求过于频繁" }, 429);
    }

    // 读取 body
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, string>;

    if (contentType.includes("application/json")) {
      try {
        body = await readJsonBody<Record<string, string>>(request, BODY_LIMITS.oauthJson);
      } catch (error) {
        if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
        return resJson(
          { error: "invalid_request", error_description: "请求体不是合法的 JSON" },
          400
        );
      }
    } else {
      const formData = await readFormDataBody(request, BODY_LIMITS.oauthJson);
      body = {};
      formData.forEach((v, k) => {
        body[k] = v.toString();
      });
    }

    const { client_id, client_secret, conflict } = getClientCredentials(request, body);

    if (conflict) {
      return resJson(
        { error: "invalid_client", error_description: "不允许同时使用多种客户端认证方式" },
        400
      );
    }

    if (!client_id) {
      return resJson({ error: "invalid_client", error_description: "缺少 client_id" }, 401);
    }

    // 验证 client：Public Client 允许不传 secret
    const verifyResult = await verifyOAuthClientSecret(client_id, client_secret, {
      allowPublic: true,
    });
    if (!verifyResult.client) {
      scheduleSsoEvent({
        event: "introspect",
        clientId: client_id,
        ip,
        success: false,
        detail: { reason: verifyResult.reason },
      });
      return resJson({ error: "invalid_client", error_description: "Client 认证失败" }, 401);
    }
    const client = verifyResult.client;

    // 已认证阶段：client 级桶。子站服务端通常共享出口 IP，IP 桶只防未认证滥用；
    // 认证通过后的正常 introspection 流量按 client 塑形，避免多个子站互相挤占。
    const clientLimitResult = await rateLimit(`client:${client_id}`, "oauth-introspect");
    if (!clientLimitResult.success) {
      return resJson({ error: "rate_limited", error_description: "子项目请求过于频繁" }, 429);
    }

    const token = body.token;
    if (!token) {
      return resJson({ active: false });
    }

    // 验证 token（仅接受 OAuth access_token 类型）
    const payload = await verifyOAuthAccessToken(token);

    if (!payload) {
      scheduleSsoEvent({
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
      scheduleSsoEvent({
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

    // 用户级黑名单与 JTI 级撤销检查由 verifyOAuthAccessToken 内部统一完成，
    // 此处不重复检查（payload 非 null 即已通过全部校验）

    scheduleSsoEvent({
      event: "introspect",
      userId: payload.id,
      clientId: client_id,
      clientName: client.name,
      ip,
      success: true,
      detail: { active: true },
    });

    const cnf = (payload as Record<string, unknown>).cnf as { jkt?: string } | undefined;
    const clientType = (payload as { client_type?: string }).client_type ?? null;
    const sid = (payload as { sid?: string }).sid;
    const authTime = (payload as { auth_time?: number }).auth_time;
    const isDpopBound = !!cnf?.jkt;

    return resJson({
      active: true,
      // RFC 9449 §7.1：DPoP 绑定的 token 必须告知资源服务器，并返回 cnf 供其校验 proof
      token_type: isDpopBound ? "DPoP" : "Bearer",
      sub: payload.id,
      client_id: payload.client_id,
      scope: payload.scope ?? "",
      exp: payload.exp,
      iat: payload.iat,
      iss: getIssuer(),
      ...(clientType ? { client_type: clientType } : {}),
      ...(sid ? { sid } : {}),
      ...(typeof authTime === "number" ? { auth_time: authTime } : {}),
      ...(isDpopBound ? { cnf } : {}),
    });
  } catch (error) {
    if (isBodyTooLargeError(error)) return payloadTooLargeResponse(error.limit);
    apiConsole.error("[OAuth Introspect] 异常:", error);
    const corsHeaders = await getOAuthCorsHeaders(request);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500, headers: { ...corsHeaders, "Cache-Control": "no-store" } }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
