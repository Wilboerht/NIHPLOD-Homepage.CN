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
import { refreshUserSession, type RefreshUserSessionResult } from "@/lib/session-refresh";
import { extractDeviceInfo } from "@/lib/auth-security";
import { rateLimit, getClientIP } from "@/lib/ratelimit";
import { validateCSRFToken, csrfForbiddenResponse } from "@/lib/csrf";
import { SUPPORTED_SCOPES, OIDC_IMPLICIT_SCOPES, getIssuer } from "@/lib/oauth-constants";
import { scheduleSsoEvent } from "@/lib/sso-audit";
import { apiConsole } from "@/lib/logger";
import { respondOAuthError } from "@/lib/oauth-error-page";
import {
  USER_COOKIE_NAME,
  USER_REFRESH_COOKIE_NAME,
  USER_ACCESS_COOKIE_OPTIONS,
  USER_REFRESH_COOKIE_OPTIONS,
  type UserJWTPayload,
} from "@/types/auth";
import { prisma } from "@/lib/prisma";
import { createHmac, timingSafeEqual, createHash, randomBytes } from "crypto";

/**
 * 生成 cuid 兼容 ID（与 Prisma @default(cuid()) 生成的格式一致：
 * 24 位小写字母数字、首字符为字母）。用于 raw SQL INSERT 时应用层生成主键，
 * 避免使用 gen_random_uuid() 造成与全库 cuid 风格不一致。
 * 拒绝采样消除取模偏置（256 不能被 26/36 整除），与 oauth-client.ts 的
 * clientId 生成方式一致。
 */
function generateConsentId(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const alphabet = letters + "0123456789";
  // 从均匀分布的字节中取 < maxValid 的值再取模，拒绝尾部不均匀区间
  const pickChar = (pool: string): string => {
    const maxValid = Math.floor(256 / pool.length) * pool.length;
    for (;;) {
      const b = randomBytes(1)[0];
      if (b < maxValid) return pool[b % pool.length];
    }
  };
  let id = pickChar(letters);
  for (let i = 1; i < 24; i++) {
    id += pickChar(alphabet);
  }
  return id;
}

// OAuth 参数临时存储：HMAC 签名的无状态 token，多实例安全
// 将 OAuth 参数编码到 oauth_id 中，无需服务端存储
const PARAMS_STORE_TTL_MS = 10 * 60 * 1000; // 10 分钟

function getOAuthParamsHmacKey(): Buffer {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("[OAuth Authorize] 缺少 JWT_ACCESS_SECRET 用于 OAuth 参数签名");
  return createHash("sha256").update(`oauth_params_hmac_key:${secret}`).digest();
}

function storeOAuthParams(params: string): string {
  const expiresAt = Date.now() + PARAMS_STORE_TTL_MS;
  const payload = `${expiresAt}:${params}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", getOAuthParamsHmacKey()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function getOAuthParams(id: string): string | null {
  const dotIdx = id.indexOf(".");
  if (dotIdx === -1) return null;
  const encoded = id.slice(0, dotIdx);
  const sig = id.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", getOAuthParamsHmacKey())
    .update(encoded)
    .digest("base64url");
  try {
    if (
      sig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const colonIdx = payload.indexOf(":");
  if (colonIdx === -1) return null;
  const expiresAt = parseInt(payload.slice(0, colonIdx), 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return payload.slice(colonIdx + 1);
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
  // 应用层生成 cuid 主键（与 schema @default(cuid()) 同风格），保持 ON CONFLICT 合并 scope 逻辑
  const id = generateConsentId();
  await prisma.$executeRaw`
    INSERT INTO "UserConsent" ("id", "userId", "clientId", "scopes", "grantedAt")
    VALUES (${id}, ${userId}, ${clientId}, ${scopes}::text[], NOW())
    ON CONFLICT ("userId", "clientId")
    DO UPDATE SET
      "scopes" = ARRAY(SELECT DISTINCT unnest(array_cat("UserConsent"."scopes", ${scopes}::text[]))),
      "revokedAt" = NULL,
      "grantedAt" = NOW()
  `;
}

/**
 * 用户拒绝授权（deny）时仅回传 access_denied，不撤销此前已授予的 consent：
 * 拒绝"扩大 scope"不应把用户历史授权一并作废。
 */

/** 获取公网 origin（反向代理后 request.url 可能为 localhost） */
function getPublicOrigin(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin
  );
}

// 支持的 scope 列表（从共享常量导入）

/**
 * 构造 OAuth 2.0 错误重定向响应。
 * 当 client_id / redirect_uri 已识别并合法时，按规范把错误通过 302
 * 回传给回调地址，而非直接返回 JSON 400。
 * RFC 9207：统一附带 iss 参数，便于 client 区分响应来源（防混叠攻击）。
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
  url.searchParams.set("iss", getIssuer());
  return NextResponse.redirect(url, 302);
}

export async function GET(request: NextRequest) {
  // 透明刷新（第 6.1 步）成功后待下发的新会话 Cookie。
  // GET 后续有多条返回路径（auto-approve 302、consent 页 302、prompt=none 错误回传、
  // prompt=login / 未登录 302、max_age 回落等），统一经 withRefreshedSession 包装响应，
  // 保证刷新成功后命中的那条响应都携带新双 token 的 Set-Cookie。
  // 声明在 try 之外：catch 的 500 错误页同样可能发生在刷新成功之后，需要带上 Cookie。
  let refreshedSessionCookies: { accessToken: string; refreshToken: string } | null = null;
  const withRefreshedSession = (response: NextResponse): NextResponse => {
    if (refreshedSessionCookies) {
      response.cookies.set(
        USER_COOKIE_NAME,
        refreshedSessionCookies.accessToken,
        USER_ACCESS_COOKIE_OPTIONS
      );
      response.cookies.set(
        USER_REFRESH_COOKIE_NAME,
        refreshedSessionCookies.refreshToken,
        USER_REFRESH_COOKIE_OPTIONS
      );
    }
    return response;
  };
  try {
    const ip = getClientIP(request);

    // 限流
    // 多租户：限流 key 应为 {tenantId}:oauth-authorize:{ip}，当前使用 "" 作为默认 tenantId
    const limitResult = await rateLimit(ip, "oauth-authorize");
    if (!limitResult.success) {
      // 浏览器直接访问时渲染品牌化错误页，API 调用返回 JSON
      return respondOAuthError(request, 429, "rate_limited", "请求过于频繁");
    }

    const { searchParams } = request.nextUrl;

    // OAuth 参数检索模式（consent 页通过 oauth_id 取回参数）
    // 存储的参数包含 state/code_challenge 等授权上下文，要求请求携带有效登录会话：
    // consent 页场景本来就已登录（authorize GET 重定向 consent 页面前已校验登录态），
    // 未登录的匿名调用一律 401，防止任何人凭 oauth_id 读取授权参数
    const oauthId = searchParams.get("oauth_id");
    if (oauthId) {
      const sessionToken = request.cookies.get(USER_COOKIE_NAME)?.value;
      const sessionPayload = sessionToken ? await verifyUserToken(sessionToken) : null;
      if (!sessionPayload) {
        return NextResponse.json(
          { error: "unauthorized", error_description: "请先登录" },
          { status: 401 }
        );
      }
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
    //    按 OAuth 2.0 规范禁止自动重定向；浏览器访问渲染品牌化错误页，API 返回 JSON 400
    if (!client_id || !redirect_uri) {
      return respondOAuthError(request, 400, "invalid_request", "缺少 client_id 或 redirect_uri");
    }
    try {
      new URL(redirect_uri);
    } catch {
      return respondOAuthError(request, 400, "invalid_request", "redirect_uri 不是合法 URL");
    }

    // 参数长度限制（防滥用）
    if (client_id.length > 128 || redirect_uri.length > 1024) {
      return respondOAuthError(request, 400, "invalid_request", "client_id 或 redirect_uri 过长");
    }

    // 2. 校验 client
    const client = await getOAuthClientByClientId(client_id);
    if (!client) {
      return respondOAuthError(request, 400, "invalid_request", "client_id 或 redirect_uri 无效");
    }

    // 3. redirect_uri 精确匹配
    if (!client.redirectUris.includes(redirect_uri)) {
      return respondOAuthError(request, 400, "invalid_request", "client_id 或 redirect_uri 无效");
    }

    // 自此 redirect_uri 已验证为合法，后续所有参数错误均通过 302 回传
    const safeRedirectUri = redirect_uri;

    // Client 已停用：通过 302 回传错误
    if (!client.isActive) {
      return buildErrorRedirect(safeRedirectUri, "unauthorized_client", "Client 已停用", state);
    }

    // 4. 其余参数校验与错误 302 回传
    const response_type = searchParams.get("response_type");
    const scope = searchParams.get("scope") || "";
    const code_challenge = searchParams.get("code_challenge") || "";
    const code_challenge_method = searchParams.get("code_challenge_method") || "";
    const nonce = searchParams.get("nonce");
    const prompt = searchParams.get("prompt") || "";
    const maxAgeRaw = searchParams.get("max_age");
    const loginHint = searchParams.get("login_hint") || "";
    // SDK 弹窗登录的非标准参数：仅透传，不入库
    const popupNonce = searchParams.get("popup_nonce");

    if (response_type !== "code") {
      return buildErrorRedirect(
        safeRedirectUri,
        "unsupported_response_type",
        "response_type 必须为 code",
        state
      );
    }
    if (!scope.trim()) {
      return buildErrorRedirect(safeRedirectUri, "invalid_request", "缺少 scope", state);
    }
    // 参数长度限制（防滥用）
    if (scope.length > 256) {
      return buildErrorRedirect(safeRedirectUri, "invalid_request", "scope 参数过长", state);
    }
    if (nonce && nonce.length > 128) {
      return buildErrorRedirect(safeRedirectUri, "invalid_request", "nonce 参数过长", state);
    }
    if (popupNonce && popupNonce.length > 64) {
      return buildErrorRedirect(safeRedirectUri, "invalid_request", "popup_nonce 参数过长", state);
    }
    if (!state || state.length < 32 || state.length > 512) {
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
    if (prompt && !["none", "login", "consent"].includes(prompt)) {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "prompt 参数无效，仅支持 none/login/consent",
        state
      );
    }
    let maxAge: number | undefined;
    if (maxAgeRaw !== null) {
      maxAge = parseInt(maxAgeRaw, 10);
      if (!Number.isFinite(maxAge) || maxAge < 0) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_request",
          "max_age 参数无效，必须为非负整数",
          state
        );
      }
    }

    // 5. scope 校验
    // 注意：openid 是 OIDC 核心 scope，所有 client 默认允许，无需在 client.scopes 中显式配置
    const requestedScopes = scope.split(" ").filter(Boolean);
    for (const s of requestedScopes) {
      if (!SUPPORTED_SCOPES.includes(s)) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_scope",
          `权限范围 '${s}' 不受支持`,
          state
        );
      }
      if (!client.scopes.includes(s) && !OIDC_IMPLICIT_SCOPES.includes(s)) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_scope",
          `该应用未被授予权限范围 '${s}'`,
          state
        );
      }
    }

    // 6. 检查用户登录状态
    const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
    let isLoggedIn = false;
    let userAuthTime: Date | null = null;
    // 登录用户的 token 载荷：来自 access token 验证，或透明刷新后的新会话
    let userPayload: UserJWTPayload | null = null;
    if (userToken) {
      const payload = await verifyUserToken(userToken);
      if (payload) {
        const statusCheck = await checkUserStatus(payload.id);
        const blacklisted = await isTokenBlacklisted(payload.id);
        isLoggedIn = statusCheck.valid && !blacklisted;
        // 认证时间以固化的 auth_time 为准（refresh 换发不重置），
        // 旧 token 无 auth_time 时回退 iat，防止 max_age 被 token 刷新架空
        const authTime = payload.auth_time ?? payload.iat;
        if (isLoggedIn) {
          userPayload = payload;
          if (authTime) {
            userAuthTime = new Date(authTime * 1000);
          }
        }
      }
    }

    // 6.1 透明刷新兜底：主站 access token 仅 2h，refresh token 30d。
    // 用户主站长期未活动后子站发起 SSO 授权时，access cookie 已失效但 refresh
    // cookie 仍有效；此处就地轮换双 token 并继续授权流程（用户无感知），
    // 避免 SSO 会话寿命被偷换成 access token 的 2h。
    // 不引入额外限流（authorize 自身已有限流）；审计日志由 refreshUserSession
    // 以 channel="authorize_transparent_refresh" 记录。
    if (!isLoggedIn) {
      const refreshTokenCookie = request.cookies.get(USER_REFRESH_COOKIE_NAME)?.value;
      if (refreshTokenCookie) {
        let refreshResult: RefreshUserSessionResult | null = null;
        try {
          refreshResult = await refreshUserSession(refreshTokenCookie, {
            ip,
            deviceInfo: extractDeviceInfo(request),
            channel: "authorize_transparent_refresh",
          });
        } catch (refreshErr) {
          // 刷新异常不阻断授权流程：按未登录回落到下方既有路径（重新登录）
          apiConsole.error("[OAuth Authorize GET] 透明刷新会话异常:", refreshErr);
        }
        if (refreshResult?.success) {
          isLoggedIn = true;
          userPayload = { id: refreshResult.userId, type: "user" };
          refreshedSessionCookies = {
            accessToken: refreshResult.accessToken,
            refreshToken: refreshResult.refreshToken,
          };
          // max_age 语义沿用刷新后透传的 auth_time（刷新不重置认证时间）
          if (refreshResult.authTime) {
            userAuthTime = new Date(refreshResult.authTime * 1000);
          }
        }
      }
    }

    // 7. max_age 校验：用户认证时间超过 maxAge 秒则要求重新登录
    if (maxAge !== undefined && isLoggedIn && userAuthTime) {
      const authAgeSeconds = (Date.now() - userAuthTime.getTime()) / 1000;
      if (authAgeSeconds > maxAge) {
        isLoggedIn = false;
      }
    }

    // 8. prompt=none：未登录或 max_age 超期时按 OIDC 回传 login_required，而非 302 到交互页
    if (prompt === "none" && !isLoggedIn) {
      return withRefreshedSession(
        buildErrorRedirect(safeRedirectUri, "login_required", "用户未登录或会话已过期", state)
      );
    }

    // 9. 未登录 → 302 到登录页（prompt=none 已在上面处理）
    if (!isLoggedIn) {
      const returnTo = `/api/oauth/authorize?${searchParams.toString()}`;
      const loginUrl = new URL("/login", getPublicOrigin(request));
      loginUrl.searchParams.set("return_to", returnTo);
      loginUrl.searchParams.set("client_name", client.name);
      if (loginHint) loginUrl.searchParams.set("login_hint", loginHint);
      return withRefreshedSession(NextResponse.redirect(loginUrl, 302));
    }

    // isLoggedIn 为 true 时 userPayload 必已在第 6/6.1 步赋值
    const sessionUserId = userPayload!.id;

    // 10. prompt=login: 强制重新认证
    if (prompt === "login") {
      const returnTo = `/api/oauth/authorize?${searchParams.toString()}`;
      const loginUrl = new URL("/login", getPublicOrigin(request));
      loginUrl.searchParams.set("return_to", returnTo);
      loginUrl.searchParams.set("client_name", client.name);
      loginUrl.searchParams.set("reauth", "1");
      if (loginHint) loginUrl.searchParams.set("login_hint", loginHint);
      return withRefreshedSession(NextResponse.redirect(loginUrl, 302));
    }

    // 11. 已登录 → 查询用户是否已授权过该 client 且 scope 未扩大
    const existingConsent = await prisma.userConsent.findUnique({
      where: { userId_clientId: { userId: sessionUserId, clientId: client_id } },
    });
    const grantedScopes =
      existingConsent && !existingConsent.revokedAt ? existingConsent.scopes : [];
    const alreadyConsented = requestedScopes.every((s) => grantedScopes.includes(s));

    // 12. prompt=consent: 强制展示 consent 页（select_account 不支持，已在上方参数校验中拒绝）
    if (alreadyConsented && prompt !== "consent") {
      // 已授权且 scope 未扩大：直接签发授权码并跳转回回调地址
      let codeData;
      try {
        codeData = await createAuthorizationCode({
          clientId: client_id,
          userId: sessionUserId,
          redirectUri: redirect_uri,
          scopes: requestedScopes,
          codeChallenge: code_challenge,
          codeChallengeMethod: code_challenge_method,
          nonce: nonce || undefined,
          ttlMs: client.codeTtlSeconds * 1000,
        });
      } catch (codeErr) {
        apiConsole.error("[OAuth Authorize GET] 创建授权码失败:", codeErr);
        return withRefreshedSession(
          buildErrorRedirect(safeRedirectUri, "server_error", "服务器内部错误", state)
        );
      }

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", codeData.code);
      if (state) redirectUrl.searchParams.set("state", state);
      // RFC 9207：成功重定向同样附带 iss
      redirectUrl.searchParams.set("iss", getIssuer());
      // SDK 弹窗登录：授权成功重定向原样透传 popup_nonce（不入库，仅透传）
      if (popupNonce) redirectUrl.searchParams.set("popup_nonce", popupNonce);

      scheduleSsoEvent({
        event: "authorize",
        userId: sessionUserId,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: true,
        detail: { scope, scopes: requestedScopes, auto_approved: true },
      });

      return withRefreshedSession(NextResponse.redirect(redirectUrl, 302));
    }

    // prompt=none 且需要 consent 交互：按 OIDC 回传 consent_required，而非 302 到 consent 页
    if (prompt === "none") {
      return withRefreshedSession(
        buildErrorRedirect(
          safeRedirectUri,
          "consent_required",
          "需要用户授权交互，prompt=none 无法静默完成",
          state
        )
      );
    }

    // 否则展示 consent 页：OAuth 参数服务端存储，URL 仅传递随机 ID
    const storedId = storeOAuthParams(searchParams.toString());
    const consentUrl = new URL("/login", getPublicOrigin(request));
    consentUrl.searchParams.set("mode", "consent");
    consentUrl.searchParams.set("client_name", client.name);
    consentUrl.searchParams.set("oauth_id", storedId);
    // 额外透传 client_id/redirect_uri/state：oauth_id 过期（10 分钟 TTL）后，
    // consent 页仍可经 /api/oauth/cancel 取消授权返回应用（cancel 会重新校验归属）
    consentUrl.searchParams.set("client_id", client_id);
    consentUrl.searchParams.set("redirect_uri", redirect_uri);
    consentUrl.searchParams.set("state", state);

    return withRefreshedSession(NextResponse.redirect(consentUrl, 302));
  } catch (error) {
    apiConsole.error("[OAuth Authorize GET] 异常:", error);
    // 浏览器直接访问时渲染品牌化错误页，API 调用返回 JSON
    // 若异常发生在透明刷新成功之后，同样携带新会话 Cookie，避免轮换后的 token 丢失
    return withRefreshedSession(respondOAuthError(request, 500, "server_error", "服务器内部错误"));
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

    // 解析 body（JSON 解析失败按 invalid_request 400 处理，而非 500）
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_request", error_description: "请求体不是合法的 JSON" },
        { status: 400 }
      );
    }

    // 先提取关键参数，用于判断是否可以安全地重定向错误
    const client_id = typeof body.client_id === "string" ? body.client_id : "";
    const redirect_uri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    const state = typeof body.state === "string" ? body.state : undefined;
    const action = body.action;

    if (!state || state.length < 32 || state.length > 512) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "state 参数无效或长度不足" },
        { status: 400 }
      );
    }

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
        { error: "invalid_request", error_description: "client_id 或 redirect_uri 无效" },
        { status: 400 }
      );
    }

    // redirect_uri 精确匹配
    if (!client.redirectUris.includes(redirect_uri)) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "client_id 或 redirect_uri 无效" },
        { status: 400 }
      );
    }

    // 自此 redirect_uri 已验证为合法，后续所有参数错误均通过 302 回传
    const safeRedirectUri = redirect_uri;

    // Client 已停用：通过 302 回传错误
    if (!client.isActive) {
      return buildErrorRedirect(safeRedirectUri, "unauthorized_client", "Client 已停用", state);
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
    const code_challenge_method =
      typeof body.code_challenge_method === "string" ? body.code_challenge_method : "";
    const nonce = typeof body.nonce === "string" ? body.nonce : undefined;
    // SDK 弹窗登录的非标准参数：仅透传，不入库
    let popup_nonce = typeof body.popup_nonce === "string" ? body.popup_nonce : "";

    // 参数长度限制（与 GET 对齐）
    if (scope.length > 256) {
      return buildErrorRedirect(safeRedirectUri, "invalid_request", "scope 参数过长", state);
    }
    if (nonce && nonce.length > 128) {
      return buildErrorRedirect(safeRedirectUri, "invalid_request", "nonce 参数过长", state);
    }
    if (popup_nonce.length > 64) {
      return buildErrorRedirect(safeRedirectUri, "invalid_request", "popup_nonce 参数过长", state);
    }

    // 纵深防御：携带 oauth_id 时，客户端回传的授权参数必须与 GET 阶段
    // storeOAuthParams 服务端存储的原始请求一致，防篡改
    // （action=approve 时 oauth_id 为必填，见下方 approve 分支校验）
    const oauthId = typeof body.oauth_id === "string" ? body.oauth_id : "";
    if (oauthId) {
      const storedParams = getOAuthParams(oauthId);
      if (!storedParams) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "oauth_id 已过期或无效" },
          { status: 400 }
        );
      }
      const stored = new URLSearchParams(storedParams);
      const mismatch =
        stored.get("client_id") !== client_id ||
        stored.get("redirect_uri") !== redirect_uri ||
        stored.get("state") !== state ||
        (stored.get("scope") || "") !== scope ||
        (stored.get("code_challenge") || "") !== code_challenge ||
        (stored.get("code_challenge_method") || "") !== code_challenge_method ||
        (stored.get("nonce") || "") !== (nonce || "");
      if (mismatch) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "授权参数与服务端存储不一致" },
          { status: 400 }
        );
      }
      // consent 页未回传 popup_nonce 时，从服务端存储的原始参数中补齐
      if (!popup_nonce) popup_nonce = stored.get("popup_nonce") || "";
    }

    // 构建重定向 URL（成功或错误都用它）
    // RFC 9207：统一附带 iss 参数，便于 client 区分响应来源
    const redirectUrl = new URL(safeRedirectUri);
    redirectUrl.searchParams.set("iss", getIssuer());
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    // consent 页通过 fetch 提交：浏览器对 302 + redirect:manual 返回 opaqueredirect，
    // 前端读不到 Location。AJAX 请求改为 200 JSON 返回 redirectUrl，由前端自行跳转；
    // 非 AJAX 调用（如直接表单提交）保持规范 302 行为。
    const wantsJsonRedirect =
      request.headers.get("x-requested-with") === "XMLHttpRequest" ||
      (request.headers.get("accept") || "").includes("application/json");
    const respondWithRedirect = (url: URL) =>
      wantsJsonRedirect
        ? NextResponse.json({ success: true, data: { redirectUrl: url.toString() } })
        : NextResponse.redirect(url, 302);

    if (action === "deny") {
      redirectUrl.searchParams.set("error", "access_denied");
      redirectUrl.searchParams.set("error_description", "用户拒绝了授权请求");

      // 注意：deny 不再撤销既有 consent——用户拒绝的是本次扩大的 scope，
      // 历史授权保持有效，避免一次"拒绝"把既有登录态全部作废

      scheduleSsoEvent({
        event: "consent",
        userId: userPayload.id,
        clientId: client_id,
        clientName: client.name,
        ip,
        success: false,
        detail: { action: "deny", scope },
      });

      return respondWithRedirect(redirectUrl);
    }

    // action === "approve"
    const requestedScopes = scope.split(" ").filter(Boolean);

    // scope 非空校验：空授权无意义，且会导致签发无权限的授权码
    if (requestedScopes.length === 0) {
      return buildErrorRedirect(safeRedirectUri, "invalid_scope", "scope 参数不能为空", state);
    }

    // PKCE: 强制要求 code_challenge + S256
    if (!code_challenge || code_challenge_method !== "S256") {
      return buildErrorRedirect(
        safeRedirectUri,
        "invalid_request",
        "缺少 code_challenge（必须为 S256）",
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
          `权限范围 '${s}' 不受支持`,
          state
        );
      }
      if (!client.scopes.includes(s) && !OIDC_IMPLICIT_SCOPES.includes(s)) {
        return buildErrorRedirect(
          safeRedirectUri,
          "invalid_scope",
          `该应用未被授予权限范围 '${s}'`,
          state
        );
      }
    }

    // approve 必须携带有效 oauth_id：防篡改比对依赖 GET 阶段 storeOAuthParams 的
    // 服务端存储，缺失时无法确认回传参数未被篡改，拒绝并提示重新发起授权
    if (!oauthId) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "缺少 oauth_id，请重新发起授权" },
        { status: 400 }
      );
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
        ttlMs: client.codeTtlSeconds * 1000,
      });
    } catch (codeErr) {
      apiConsole.error("[OAuth Authorize POST] 创建授权码失败:", codeErr);
      return buildErrorRedirect(safeRedirectUri, "server_error", "服务器内部错误", state);
    }

    redirectUrl.searchParams.set("code", codeData.code);
    // SDK 弹窗登录：授权成功重定向原样透传 popup_nonce（不入库，仅透传）
    if (popup_nonce) redirectUrl.searchParams.set("popup_nonce", popup_nonce);

    scheduleSsoEvent({
      event: "authorize",
      userId: userPayload.id,
      clientId: client_id,
      clientName: client.name,
      ip,
      success: true,
      detail: { scope, scopes: requestedScopes },
    });

    return respondWithRedirect(redirectUrl);
  } catch (error) {
    apiConsole.error("[OAuth Authorize POST] 异常:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "服务器内部错误" },
      { status: 500 }
    );
  }
}
