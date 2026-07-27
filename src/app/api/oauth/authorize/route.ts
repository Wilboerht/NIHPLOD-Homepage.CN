/**
 * OAuth 2.0 授权端点
 * GET  /api/oauth/authorize — 参数校验 + 重定向登录页
 * POST /api/oauth/authorize — 用户 consent + 签发授权码
 *
 * 支持 PKCE (S256) 增强安全。
 */
import { NextRequest, NextResponse } from "next/server";
import { getOAuthClientByClientId } from "@/lib/oauth-client";
import { createAuthorizationCode } from "@/lib/oauth-code";
import { verifyUserToken } from "@/lib/jwt";
import { checkUserStatus } from "@/lib/auth";
import { isTokenBlacklisted } from "@/lib/token-blacklist";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { recordSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";
import { USER_COOKIE_NAME } from "@/types/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

// 支持的 scope 列表
const SUPPORTED_SCOPES = ["openid", "profile", "phone", "membership"];

// GET 参数校验
const authorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url().min(1),
  scope: z.string().min(1),
  state: z.string().min(32),
  code_challenge: z.string().length(43),
  code_challenge_method: z.literal("S256"),
});

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流
    // 多租户：限流 key 应为 {tenantId}:oauth-authorize:{ip}，当前使用 "" 作为默认 tenantId
    const limitResult = await rateLimit(ip, "oauth-authorize");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    const { searchParams } = request.nextUrl;

    // 1. 参数校验
    const parsed = authorizeQuerySchema.safeParse({
      response_type: searchParams.get("response_type"),
      client_id: searchParams.get("client_id"),
      redirect_uri: searchParams.get("redirect_uri"),
      scope: searchParams.get("scope"),
      state: searchParams.get("state"),
      code_challenge: searchParams.get("code_challenge"),
      code_challenge_method: searchParams.get("code_challenge_method"),
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = firstIssue.path.join(".");
      const description = field
        ? `缺少或无效的参数: ${field}`
        : "参数错误";
      return NextResponse.json(
        { error: "invalid_request", error_description: description },
        { status: 400 }
      );
    }

    const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = parsed.data;

    // 2. 校验 client
    const client = await getOAuthClientByClientId(client_id);
    if (!client) {
      return NextResponse.json(
        { error: "unauthorized_client", error_description: "Client not found" },
        { status: 400 }
      );
    }

    // 3. redirect_uri 精确匹配
    if (!client.redirectUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri not allowed" },
        { status: 400 }
      );
    }

    // 4. scope 校验
    // 注意：openid 是 OIDC 核心 scope，所有 client 默认允许，无需在 client.scopes 中显式配置
    const requestedScopes = scope.split(" ").filter(Boolean);
    for (const s of requestedScopes) {
      if (!client.scopes.includes(s) && s !== "openid") {
        return NextResponse.json(
          { error: "invalid_scope", error_description: `Scope '${s}' not allowed for this client` },
          { status: 400 }
        );
      }
      if (!SUPPORTED_SCOPES.includes(s)) {
        return NextResponse.json(
          { error: "invalid_scope", error_description: `Scope '${s}' not supported` },
          { status: 400 }
        );
      }
    }

    // 5. PKCE: 强制要求 code_challenge + S256（OAuth 2.1 / 公共安全最佳实践）
    if (!code_challenge || code_challenge_method !== "S256") {
      return NextResponse.json(
        { error: "invalid_request", error_description: "code_challenge (S256) is required" },
        { status: 400 }
      );
    }

    // 6. 检查用户登录状态
    const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
    let isLoggedIn = false;
    if (userToken) {
      const payload = await verifyUserToken(userToken);
      if (payload) {
        // 额外检查：token 黑名单和账号状态
        const statusCheck = await checkUserStatus(payload.id);
        const blacklisted = isTokenBlacklisted(payload.id);
        isLoggedIn = statusCheck.valid && !blacklisted;
      }
    }

    // 7. 未登录 → 302 到登录页
    if (!isLoggedIn) {
      // 保留所有原始 query 参数
      const returnTo = `/api/oauth/authorize?${searchParams.toString()}`;
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("return_to", encodeURIComponent(returnTo));
      loginUrl.searchParams.set("client_name", client.name);
      return NextResponse.redirect(loginUrl);
    }

    // 8. 已登录 → 展示 consent 页
    // 注意：searchParams.toString() 已自动进行 URL 编码，此处不重复 encodeURIComponent
    const consentUrl = new URL("/login", request.url);
    consentUrl.searchParams.set("mode", "consent");
    consentUrl.searchParams.set("client_name", client.name);
    consentUrl.searchParams.set("return_to", `/api/oauth/authorize?${searchParams.toString()}`);

    return NextResponse.redirect(consentUrl);
  } catch (error) {
    apiConsole.error("[OAuth Authorize GET] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

// POST body schema
const consentSchema = z.object({
  action: z.enum(["approve", "deny"]),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string(),
  state: z.string().min(32),
  code_challenge: z.string().length(43),
  code_challenge_method: z.literal("S256"),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);

    // 限流
    // 多租户：限流 key 应为 {tenantId}:oauth-authorize:{ip}，当前使用 "" 作为默认 tenantId
    const limitResult = await rateLimit(ip, "oauth-authorize");
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "请求过于频繁" },
        { status: 429 }
      );
    }

    // CSRF 防护：consent 操作必须携带 CSRF Token
    if (!validateCSRFToken(request)) {
      return csrfForbiddenResponse();
    }

    // 验证用户登录
    const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
    if (!userToken) {
      return NextResponse.json(
        { error: "unauthorized", error_description: "请先登录" },
        { status: 401 }
      );
    }

    const userPayload = await verifyUserToken(userToken);
    if (!userPayload) {
      return NextResponse.json(
        { error: "unauthorized", error_description: "登录状态已过期" },
        { status: 401 }
      );
    }

    // 检查用户账号状态
    const statusCheck = await checkUserStatus(userPayload.id);
    if (!statusCheck.valid) {
      return NextResponse.json(
        { error: "account_disabled", error_description: statusCheck.reason || "账户不可用" },
        { status: 403 }
      );
    }

    // 检查 access token 黑名单
    if (isTokenBlacklisted(userPayload.id)) {
      return NextResponse.json(
        { error: "account_disabled", error_description: "账户已被限制" },
        { status: 403 }
      );
    }

    // 解析 body
    const body = await request.json();
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const field = firstIssue.path.join(".");
      const description = field
        ? `缺少或无效的参数: ${field}`
        : "参数错误";
      return NextResponse.json(
        { error: "invalid_request", error_description: description },
        { status: 400 }
      );
    }

    const { action, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = parsed.data;

    // 校验 client
    const client = await getOAuthClientByClientId(client_id);
    if (!client) {
      return NextResponse.json(
        { error: "unauthorized_client", error_description: "Client not found" },
        { status: 400 }
      );
    }

    // redirect_uri 精确匹配
    if (!client.redirectUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri not allowed" },
        { status: 400 }
      );
    }

    // 构建重定向 URL
    const redirectUrl = new URL(redirect_uri);

    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    if (action === "deny") {
      redirectUrl.searchParams.set("error", "access_denied");
      redirectUrl.searchParams.set("error_description", "用户拒绝了授权请求");

      recordSsoEvent({
        event: "consent",
        userId: userPayload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: false,
        detail: { action: "deny", scope },
      });

      return NextResponse.redirect(redirectUrl);
    }

    // action === "approve"
    const requestedScopes = scope.split(" ").filter(Boolean);

    // PKCE: 强制要求 code_challenge + S256
    if (!code_challenge || code_challenge_method !== "S256") {
      return NextResponse.json(
        { error: "invalid_request", error_description: "code_challenge (S256) is required" },
        { status: 400 }
      );
    }

    // 校验 scope：openid 始终允许，拒绝超出 client 允许范围或系统不支持的 scope
    for (const s of requestedScopes) {
      if (!client.scopes.includes(s) && s !== "openid") {
        return NextResponse.json(
          { error: "invalid_scope", error_description: `Scope '${s}' not allowed for this client` },
          { status: 400 }
        );
      }
      if (!SUPPORTED_SCOPES.includes(s)) {
        return NextResponse.json(
          { error: "invalid_scope", error_description: `Scope '${s}' not supported` },
          { status: 400 }
        );
      }
    }

    // 创建授权码
    const codeData = await createAuthorizationCode({
      clientId: client_id,
      userId: userPayload.id,
      redirectUri: redirect_uri,
      scopes: requestedScopes,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    });

    redirectUrl.searchParams.set("code", codeData.code);

    recordSsoEvent({
      event: "authorize",
      userId: userPayload.id,
      clientId: client_id,
      clientName: client.name,
      ip,
      success: true,
      detail: { scope, scopes: requestedScopes },
    });

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    apiConsole.error("[OAuth Authorize POST] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}
