/**
 * OAuth 2.0 UserInfo 端点
 * GET /api/oauth/userinfo
 *
 * 返回当前 Access Token 对应的用户信息。
 * 按 token 中的 scope claim 裁剪返回字段。
 * 敏感字段（phone）进行脱敏处理。
 *
 * CORS：仅允许已注册 redirect_uri 的 origin。
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyOAuthAccessToken } from "@/lib/jwt";
import { isTokenBlacklisted } from "@/lib/token-blacklist";
import { prisma } from "@/lib/prisma";
import { getOAuthCorsHeaders } from "@/lib/oauth-cors";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { recordSsoEvent } from "@/lib/sso-audit";
import { maskPhone } from "@/lib/mask-phone";
import { validateDPoPProof, computeDPoPAth, dpopNonceHeader } from "@/lib/dpop";
import { apiConsole } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const corsHeaders = await getOAuthCorsHeaders(request);
    const resJson = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
      NextResponse.json(body, { status, headers: { ...corsHeaders, ...extraHeaders } });

    // 限流
    const limitResult = await rateLimit(ip, "oauth-userinfo");
    if (!limitResult.success) {
      return resJson({ error: "rate_limited", error_description: "请求过于频繁" }, 429);
    }

    // 从 Authorization header 提取 token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return resJson(
        { error: "invalid_token", error_description: "缺少 Authorization header" },
        401,
        { "WWW-Authenticate": 'Bearer error="invalid_token"' }
      );
    }

    const token = authHeader.slice(7);

    // 验证 access token（不限制 audience：OAuth 2.0 Bearer Token 模式中 token 即凭证，
    //   userinfo 端点不进行 client 认证。通过 DPoP token binding 防止 token 被盗后在不同 client 重用）
    const payload = await verifyOAuthAccessToken(token);
    if (!payload) {
      recordSsoEvent({
        event: "userinfo",
        ip,
        success: false,
        detail: { reason: "invalid_token" },
      });
      return resJson(
        { error: "invalid_token", error_description: "Access token 无效或已过期" },
        401,
        { "WWW-Authenticate": 'Bearer error="invalid_token"' }
      );
    }

    // 检查 access token 黑名单（封禁后 15 分钟窗口期内的 token）
    const blacklisted = await isTokenBlacklisted(payload.id);
    if (blacklisted) {
      recordSsoEvent({
        event: "userinfo",
        userId: payload.id,
        clientId: payload.client_id,
        ip,
        success: false,
        detail: { reason: "blacklisted", blacklistReason: blacklisted.reason },
      });
      return resJson({ error: "account_disabled", error_description: "账户已被限制" }, 403);
    }

    // DPoP 绑定验证：若 token 包含 cnf.jkt，请求必须携带有效的 DPoP proof
    const dpopHeader = request.headers.get("DPoP");
    const tokenCnf = (payload as Record<string, unknown>).cnf as { jkt?: string } | undefined;
    if (tokenCnf?.jkt) {
      if (!dpopHeader) {
        return resJson(
          { error: "invalid_dpop_proof", error_description: "此 token 需要 DPoP proof" },
          401,
          { "WWW-Authenticate": 'Bearer error="invalid_token"' }
        );
      }
      const ath = computeDPoPAth(token);
      const url = new URL(request.url);
      const htu = `${url.origin}${url.pathname}`.toLowerCase();
      const dpopResult = await validateDPoPProof(
        dpopHeader,
        "GET",
        htu,
        ath,
        undefined,
        `${payload.client_id}:${payload.id}`
      );
      if (!dpopResult.valid) {
        const errorHeaders: Record<string, string> = {
          "WWW-Authenticate": `Bearer error="invalid_token", error_description="${dpopResult.errorDescription}"`,
        };
        if (dpopResult.newNonce) {
          Object.assign(errorHeaders, dpopNonceHeader(dpopResult.newNonce));
        }
        return NextResponse.json(
          { error: dpopResult.error, error_description: dpopResult.errorDescription },
          { status: 401, headers: { ...corsHeaders, ...errorHeaders } }
        );
      }
      if (dpopResult.jkt !== tokenCnf.jkt) {
        return resJson(
          { error: "invalid_dpop_proof", error_description: "DPoP 密钥与 token 绑定的密钥不匹配" },
          401,
          { "WWW-Authenticate": 'Bearer error="invalid_token"' }
        );
      }
    }

    // M2M token（client_credentials grant）：无用户身份，仅返回 sub
    if (payload.id.startsWith("client:")) {
      recordSsoEvent({
        event: "userinfo",
        clientId: payload.client_id,
        ip,
        success: true,
        detail: { type: "client_credentials" },
      });
      return resJson({ sub: payload.id });
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
      return resJson({ error: "account_disabled", error_description: "账户已被封禁或冻结" }, 403);
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

    return resJson(response);
  } catch (error) {
    apiConsole.error("[OAuth UserInfo] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const corsHeaders = await getOAuthCorsHeaders(request);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
