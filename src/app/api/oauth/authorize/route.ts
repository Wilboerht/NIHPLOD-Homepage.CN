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
import { SUPPORTED_SCOPES, OIDC_IMPLICIT_SCOPES } from "@/lib/oauth-constants";
import { recordSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";
import { USER_COOKIE_NAME } from "@/types/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// OAuth 参数临时存储（server-side，避免完整参数暴露在 URL 中）
// key: 随机 ID, value: { params: string, expiresAt: number }
const oauthParamsStore = new Map<string, { params: string; expiresAt: number }>();
const PARAMS_STORE_TTL_MS = 10 * 60 * 1000; // 10 分钟

function storeOAuthParams(params: string): string {
  // 清理过期条目
  const now = Date.now();
  for (const [id, entry] of oauthParamsStore) {
    if (now > entry.expiresAt) oauthParamsStore.delete(id);
  }
  const id = randomBytes(16).toString("hex");
  oauthParamsStore.set(id, { params, expiresAt: now + PARAMS_STORE_TTL_MS });
  return id;
}

function getOAuthParams(id: string): string | null {
  const entry = oauthParamsStore.get(id);
  if (!entry || Date.now() > entry.expiresAt) {
    oauthParamsStore.delete(id);
    return null;
  }
  oauthParamsStore.delete(id); // 一次性使用
  return entry.params;
}

export const dynamic = "force-dynamic";

/**
 * 确保用户 consent 记录存在并包含请求的 scope。
 * 已存在则合并 scope、清除撤销标记；不存在则新建。
 */
async function ensureUserConsent(
  userId: string,
  clientId: string,
  scopes: string[]
): Promise<void> {
  // 使用原生 SQL upsert 原子化合并 scope（PostgreSQL array_cat + DISTINCT unnest），
  // 消除 read-then-write 竞态。scopes 已通过 SUPPORTED_SCOPES 白名单校验，安全拼接。
  const scopesLiteral = `{${scopes.map((s) => `"${s}"`).join(",")}}`;
  await prisma.$executeRawUnsafe(`
    INSERT INTO "UserConsent" ("id", "userId", "clientId", "scopes", "grantedAt")
    VALUES (gen_random_uuid(), '${userId}', '${clientId}', '${scopesLiteral}'::text[], NOW())
    ON CONFLICT ("userId", "clientId")
    DO UPDATE SET
      "scopes" = ARRAY(SELECT DISTINCT unnest(array_cat("UserConsent"."scopes", '${scopesLiteral}'::text[]))),
      "revokedAt" = NULL,
      "grantedAt" = NOW()
  `);
}

/**
 * 用户拒绝授权时，撤销此前已授予的 consent（如存在）。
 */
async function revokeUserConsent(
  userId: string,
  clientId: string
): Promise<void> {
  const existing = await prisma.userConsent.findUnique({
    where: { userId_clientId: { userId, clientId } },
  });
  if (existing && !existing.revokedAt) {
    await prisma.userConsent.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }
}

/** 获取公网 origin（反向代理后 request.url 可能为 localhost） */
function getPublicOrigin(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    request.nextUrl.origin
  );
}

// 支持的 scope 列表（从共享常量导入）

/**
 * 构造 OAuth 2.0 错误重定向响应。
 * 当 client_id / redirect_uri 已识别并合法时，按规范把错误通过 302
 * 回传给回调地址，而非直接返回 JSON 400。
 */
function buildErrorRedirect(
  redirectUri: string,
  error: string,
  errorDescription: string,
  state?: string | null
): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", errorDescription);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url, 302);
}

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

    // OAuth 参数检索模式（consent 页通过 oauth_id 取回参数）
    const oauthId = searchParams.get("oauth_id");
    if (oauthId) {
      const params = getOAuthParams(oauthId);
      if (!params) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "参数已过期或不存在" },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, data: { params } });
    }

    // 先提取关键参数，用于判断是否可以安全地重定向错误
    const client_id = searchParams.get("client_id") || "";
    const redirect_uri = searchParams.get("redirect_uri") || "";
    const state = searchParams.get("state");

    // 1. client_id / redirect_uri 前置校验：若无法识别合法回调地址，
    //    按 OAuth 2.0 规范禁止自动重定向，直接返回 JSON 400
    if (!client_id || !redirect_uri) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "缺少 client_id 或 redirect_uri" },
        { status: 400 }
      );
    }
    try {
      new URL(redirect_uri);
    } catch {
      return NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri 不是合法 URL" },
        { status: 400 }
      );
    }

    // 2. 校验 client
    const client = await getOAuthClientByClientId(client_id);
    if (!client) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Invalid client_id or redirect_uri" },
        { status: 400 }
      );
    }

    // 3. redirect_uri 精确匹配
    if (!client.redirectUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Invalid client_id or redirect_uri" },
        { status: 400 }
      );
    }

    // 自此 redirect_uri 已验证为合法，后续所有参数错误均通过 302 回传
    const safeRedirectUri = redirect_uri;

    // Client 已停用：通过 302 回传错误
    if (!client.isActive) {
      return buildErrorRedirect(
        safeRedirectUri,
        "unauthorized_client",
        "Client 已停用",
        state
      );
    }

    // 4. 其余参数校验与错误 302 回传
    const response_type = searchParams.get("response_type");
    const scope = searchParams.get("scope") || "";
    const code_challenge = searchParams.get("code_challenge") || "";
    const code_challenge_method = searchParams.get("code_challenge_method") || "";
    const nonce = searchParams.get("nonce");

    if (response_type !== "code") {
      return buildErrorRedirect(
        safeRedirectUri,
        "unsupported_response_type",
        "response_type 必须为 code",
        state
      );
    }
    if (!scope.trim()) {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "缺少 scope",
        state
      );
    }
    if (!state || state.length < 32) {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "state 参数无效或长度不足",
        state
      );
    }
    if (code_challenge.length !== 43) {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "code_challenge 长度必须为 43",
        state
      );
    }
    if (code_challenge_method !== "S256") {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "code_challenge_method 必须为 S256",
        state
      );
    }

    // 5. scope 校验
    // 注意：openid 是 OIDC 核心 scope，所有 client 默认允许，无需在 client.scopes 中显式配置
    const requestedScopes = scope.split(" ").filter(Boolean);
    for (const s of requestedScopes) {
      if (!SUPPORTED_SCOPES.includes(s)) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_scope",
          `Scope '${s}' not supported`,
          state
        );
      }
      if (!client.scopes.includes(s) && !OIDC_IMPLICIT_SCOPES.includes(s)) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_scope",
          `Scope '${s}' not allowed for this client`,
          state
        );
      }
    }

    // 6. 检查用户登录状态
    const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
    let isLoggedIn = false;
    if (userToken) {
      const payload = await verifyUserToken(userToken);
      if (payload) {
        // 额外检查：token 黑名单和账号状态
        const statusCheck = await checkUserStatus(payload.id);
        const blacklisted = await isTokenBlacklisted(payload.id);
        isLoggedIn = statusCheck.valid && !blacklisted;
      }
    }

    // 7. 未登录 → 302 到登录页
    if (!isLoggedIn) {
      // 保留所有原始 query 参数
      const returnTo = `/api/oauth/authorize?${searchParams.toString()}`;
      const loginUrl = new URL("/login", getPublicOrigin(request));
      loginUrl.searchParams.set("return_to", returnTo);
      loginUrl.searchParams.set("client_name", client.name);
      return NextResponse.redirect(loginUrl);
    }

    // 8. 已登录 → 查询用户是否已授权过该 client 且 scope 未扩大
    const userPayload = (await verifyUserToken(userToken!))!;
    const existingConsent = await prisma.userConsent.findUnique({
      where: { userId_clientId: { userId: userPayload.id, clientId: client_id } },
    });
    const grantedScopes =
      existingConsent && !existingConsent.revokedAt ? existingConsent.scopes : [];
    const alreadyConsented = requestedScopes.every((s) => grantedScopes.includes(s));

    if (alreadyConsented) {
      // 已授权且 scope 未扩大：直接签发授权码并跳转回回调地址
      let codeData;
      try {
        codeData = await createAuthorizationCode({
          clientId: client_id,
          userId: userPayload.id,
          redirectUri: redirect_uri,
          scopes: requestedScopes,
          codeChallenge: code_challenge,
          codeChallengeMethod: code_challenge_method,
          nonce: nonce || undefined,
        });
      } catch (codeErr) {
        apiConsole.error("[OAuth Authorize GET] 创建授权码失败:", codeErr);
        return buildErrorRedirect(
          safeRedirectUri,
          "server_error",
          "服务器内部错误",
          state
        );
      }

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", codeData.code);
      if (state) redirectUrl.searchParams.set("state", state);

      recordSsoEvent({
        event: "authorize",
        userId: userPayload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { scope, scopes: requestedScopes, auto_approved: true },
      });

      return NextResponse.redirect(redirectUrl);
    }

    // 否则展示 consent 页：OAuth 参数服务端存储，URL 仅传递随机 ID
    const storedId = storeOAuthParams(searchParams.toString());
    const consentUrl = new URL("/login", getPublicOrigin(request));
    consentUrl.searchParams.set("mode", "consent");
    consentUrl.searchParams.set("client_name", client.name);
    consentUrl.searchParams.set("oauth_id", storedId);

    return NextResponse.redirect(consentUrl);
  } catch (error) {
    apiConsole.error("[OAuth Authorize GET] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}

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
    if (await isTokenBlacklisted(userPayload.id)) {
      return NextResponse.json(
        { error: "account_disabled", error_description: "账户已被限制" },
        { status: 403 }
      );
    }

    // 解析 body
    const body = await request.json();

    // 先提取关键参数，用于判断是否可以安全地重定向错误
    const client_id = typeof body.client_id === "string" ? body.client_id : "";
    const redirect_uri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    const state = typeof body.state === "string" ? body.state : undefined;
    const action = body.action;

    if (!client_id || !redirect_uri) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "缺少 client_id 或 redirect_uri" },
        { status: 400 }
      );
    }
    try {
      new URL(redirect_uri);
    } catch {
      return NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri 不是合法 URL" },
        { status: 400 }
      );
    }

    // 校验 client
    const client = await getOAuthClientByClientId(client_id);
    if (!client) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Invalid client_id or redirect_uri" },
        { status: 400 }
      );
    }

    // redirect_uri 精确匹配
    if (!client.redirectUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Invalid client_id or redirect_uri" },
        { status: 400 }
      );
    }

    // 自此 redirect_uri 已验证为合法，后续所有参数错误均通过 302 回传
    const safeRedirectUri = redirect_uri;

    // Client 已停用：通过 302 回传错误
    if (!client.isActive) {
      return buildErrorRedirect(
        safeRedirectUri,
        "unauthorized_client",
        "Client 已停用",
        state
      );
    }

    // action 校验
    if (action !== "approve" && action !== "deny") {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "action 必须为 approve 或 deny",
        state
      );
    }

    const scope = typeof body.scope === "string" ? body.scope : "";
    const code_challenge = typeof body.code_challenge === "string" ? body.code_challenge : "";
    const code_challenge_method = typeof body.code_challenge_method === "string" ? body.code_challenge_method : "";
    const nonce = typeof body.nonce === "string" ? body.nonce : undefined;

    // 构建重定向 URL（成功或错误都用它）
    const redirectUrl = new URL(safeRedirectUri);
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    if (action === "deny") {
      redirectUrl.searchParams.set("error", "access_denied");
      redirectUrl.searchParams.set("error_description", "用户拒绝了授权请求");

      // 撤销此前对该 client 的 consent（如存在）
      await revokeUserConsent(userPayload.id, client_id);

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
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "code_challenge (S256) is required",
        state
      );
    }
    if (code_challenge.length !== 43) {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "code_challenge 长度必须为 43",
        state
      );
    }

    // 校验 scope：openid 始终允许，拒绝超出 client 允许范围或系统不支持的 scope
    for (const s of requestedScopes) {
      if (!SUPPORTED_SCOPES.includes(s)) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_scope",
          `Scope '${s}' not supported`,
          state
        );
      }
      if (!client.scopes.includes(s) && !OIDC_IMPLICIT_SCOPES.includes(s)) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_scope",
          `Scope '${s}' not allowed for this client`,
          state
        );
      }
    }

    // 持久化用户 consent：合并 scope、清除撤销标记
    await ensureUserConsent(userPayload.id, client_id, requestedScopes);

    // 创建授权码
    let codeData;
    try {
      codeData = await createAuthorizationCode({
        clientId: client_id,
        userId: userPayload.id,
        redirectUri: redirect_uri,
        scopes: requestedScopes,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        nonce,
      });
    } catch (codeErr) {
      apiConsole.error("[OAuth Authorize POST] 创建授权码失败:", codeErr);
      return buildErrorRedirect(
        safeRedirectUri,
        "server_error",
        "服务器内部错误",
        state
      );
    }

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
