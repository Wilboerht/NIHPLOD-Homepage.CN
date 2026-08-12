/**
 * Backchannel Logout Token 验证端点
 * POST /api/oauth/logout/verify
 *
 * 子站通过此端点验证主站推送的 logout_token 的真实性。
 * 验证 JWT 签名、events claim（含 backchannel-logout 事件）。
 *
 * 认证方式：client_id + client_secret
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { verifyLogoutToken } from "@/lib/jwt";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流
    const limitResult = await rateLimit(ip, "default", { maxRequests: 60, windowMs: 60 * 1000 });
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
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "invalid_request", error_description: "请求体不是合法的 JSON" },
          { status: 400 }
        );
      }
    } else {
      const formData = await request.formData();
      body = {};
      formData.forEach((v, k) => {
        body[k] = v.toString();
      });
    }

    const client_id = body.client_id;
    const client_secret = body.client_secret;
    const logout_token = body.logout_token;

    if (!client_id || !client_secret) {
      return NextResponse.json(
        { error: "invalid_client", error_description: "缺少 client_id 或 client_secret" },
        { status: 401 }
      );
    }

    if (!logout_token) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "缺少 logout_token" },
        { status: 400 }
      );
    }

    // 验证 client
    const verifyResult = await verifyOAuthClientSecret(client_id, client_secret);
    if (!verifyResult.client) {
      scheduleSsoEvent({
        event: "backchannel_logout",
        clientId: client_id,
        ip,
        success: false,
        detail: { reason: "invalid_client" },
      });
      return NextResponse.json(
        { error: "invalid_client", error_description: "Client 认证失败" },
        { status: 401 }
      );
    }
    const client = verifyResult.client;

    // 验证 logout_token 签名（aud 必须匹配 client_id）
    const payload = await verifyLogoutToken(logout_token, client_id);
    if (!payload) {
      scheduleSsoEvent({
        event: "backchannel_logout",
        clientId: client_id,
        clientName: client.name,
        ip,
        success: false,
        detail: { reason: "invalid_logout_token" },
      });
      return NextResponse.json(
        { error: "invalid_logout_token", error_description: "logout_token 无效或已过期" },
        { status: 400 }
      );
    }

    // OIDC Backchannel Logout：logout_token 必须携带 sub 或 sid 二者居一
    const hasSub = typeof payload.sub === "string" && payload.sub.length > 0;
    const hasSid = typeof payload.sid === "string" && payload.sid.length > 0;
    if (!hasSub && !hasSid) {
      scheduleSsoEvent({
        event: "backchannel_logout",
        clientId: client_id,
        clientName: client.name,
        ip,
        success: false,
        detail: { reason: "missing_sub_and_sid" },
      });
      return NextResponse.json(
        {
          error: "invalid_logout_token",
          error_description: "logout_token 缺少 sub 与 sid（二者至少居一）",
        },
        { status: 400 }
      );
    }

    // 验证 events claim 是否包含 backchannel-logout 事件（OIDC 规范要求为对象）
    const expectedEvent = "http://schemas.openid.net/event/backchannel-logout";
    const events =
      typeof payload.events === "object" && payload.events !== null
        ? (payload.events as Record<string, unknown>)
        : null;
    if (!events || !(expectedEvent in events)) {
      scheduleSsoEvent({
        event: "backchannel_logout",
        userId: payload.sub,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: false,
        detail: { reason: "invalid_events_claim" },
      });
      return NextResponse.json(
        {
          error: "invalid_logout_token",
          error_description: "events claim 不包含 backchannel-logout",
        },
        { status: 400 }
      );
    }

    scheduleSsoEvent({
      event: "backchannel_logout",
      userId: payload.sub,
      clientId: client_id,
      clientName: client.name,
      ip,
      success: true,
      detail: { jti: payload.jti },
    });

    return NextResponse.json({
      success: true,
      data: {
        sub: payload.sub,
        aud: payload.aud,
        events: payload.events,
        jti: payload.jti,
      },
    });
  } catch (error) {
    apiConsole.error("[OAuth Logout Verify] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}
