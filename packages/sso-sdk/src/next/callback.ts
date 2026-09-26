/**
 * App Router 回调 Route Handler
 *
 * 在 /api/auth/callback 路由中处理 OAuth 回调：
 * 1. 验证 state 参数
 * 2. 用授权码交换 token
 * 3. 设置 session cookie
 * 4. 重定向到原始页面
 *
 * ⚠️ 此 handler 仅运行在 Node.js Runtime（非 Edge），可以使用 crypto.subtle。
 *
 * 用法 (src/app/api/auth/callback/route.ts):
 * ```ts
 * import { createCallbackRouteHandler } from "@nihplod/sso-sdk/next";
 *
 * export const GET = createCallbackRouteHandler({
 *   clientId: "my-app",
 *   ssoBaseUrl: "https://nihplod.cn",
 *   redirectUri: "https://myapp.com/api/auth/callback",
 *   tokenCookieName: "nihplod_sso_at",
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { validateIdToken } from "../core/id-token";
import { isTrustedReturnUrl, timingSafeEqualString } from "../core/security";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_NONCE_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  getHostCookieOptions,
  getSecureCookieOptions,
  resolveInsecureLocalDev,
  toInsecureCookieName,
} from "./constants";

// ============================================
// 类型定义
// ============================================

export interface CallbackRouteConfig {
  /** OAuth Client ID */
  clientId: string;

  /** SSO 中心地址 */
  ssoBaseUrl: string;

  /** 回调 URL（须与注册的 redirect_uri 一致） */
  redirectUri: string;

  /**
   * OAuth Client Secret（可选）。
   * 对于 Confidential Client（BFF/Next.js），应传入 clientSecret
   * 以提供第二因素认证。对于 Public Client（SPA），应省略此字段。
   */
  clientSecret?: string;

  /** 成功回调后重定向的默认路径，默认 "/" */
  defaultReturnPath?: string;

  /** Access Token Cookie 名称，默认 __Host-nihplod_sso_at */
  accessTokenCookieName?: string;

  /** Refresh Token Cookie 名称，默认 __Host-nihplod_sso_rt */
  refreshTokenCookieName?: string;

  /** ID Token Cookie 名称，默认 __Host-nihplod_sso_id */
  idTokenCookieName?: string;

  /** State Cookie 名称，默认 __Host-nihplod_sso_state */
  stateCookieName?: string;

  /** OIDC Nonce Cookie 名称，默认 __Host-nihplod_sso_nonce（须与 createSsoMiddleware 一致） */
  nonceCookieName?: string;

  /** Return URL Cookie 名称，默认 __Host-nihplod_sso_return */
  returnUrlCookieName?: string;

  /** PKCE Verifier Cookie 名称，默认 __Secure-nihplod_sso_verifier */
  verifierCookieName?: string;

  /**
   * 请求的 OAuth scope（空格分隔），建议与 createSsoMiddleware 的 scopes 保持一致。
   * 仅当**显式配置**且包含 openid 时回调才强制要求 token 响应携带 id_token（fail-closed）；
   * 未配置时保持兼容行为（id_token 存在则校验，缺失不拒绝），避免升级后旧接入方登录失败。
   */
  scopes?: string;

  /**
   * 本地 HTTP 开发模式（默认 false）。关闭 Cookie 的 Secure 属性并去除
   * __Host-/__Secure- 前缀；必须与 createSsoMiddleware 的配置保持一致，
   * 否则读不到 middleware 写入的 state/verifier Cookie。生产严禁启用——
   * 生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）下该开关会被
   * 强制忽略并告警。
   */
  insecureLocalDev?: boolean;

  /**
   * 服务端到服务端调用的内网地址（可选，如 http://127.0.0.1:3000）。
   * 仅用于 token 交换等服务器间请求；浏览器跳转仍使用 ssoBaseUrl 公网地址。
   */
  serverBaseUrl?: string;

  /**
   * 自定义回调错误响应（可选）。
   * 传入后优先生效；返回 undefined 时回退默认行为。
   * 默认行为：浏览器导航（Accept 含 text/html 且未带 ?format=json）渲染内置中文错误页
   * （含"重新登录"入口）；其他请求（fetch/自动化）返回 JSON，保持 API 兼容。
   */
  renderErrorPage?: (ctx: {
    error: string;
    errorDescription: string;
    status: number;
    request: NextRequest;
  }) => Response | undefined | Promise<Response | undefined>;

  /** 调试日志开关（默认 false）：回调失败时输出服务端告警日志，便于定位配置/流程问题 */
  debug?: boolean;
}

// ============================================
// 工具函数
// ============================================

// returnUrl 开放重定向校验统一使用 ../core/security 的 isTrustedReturnUrl

// ID Token 预校验逻辑已收敛到 ../core/id-token.ts

/** HTML 转义（错误描述可能含服务端返回的任意文本） */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** 内置品牌化错误页：面向浏览器用户，避免裸 JSON 与"重新登录"断头路 */
function buildErrorPage(status: number, error: string, errorDescription: string): string {
  const safeDescription = escapeHtml(errorDescription);
  const safeError = escapeHtml(error);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>登录失败</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #fafafa; color: #2c2c2c; }
  main { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; font-weight: 500; letter-spacing: 0.08em; margin: 0 0 0.75rem; }
  p { margin: 0 0 1.5rem; color: #6b7280; font-size: 0.875rem; line-height: 1.6; max-width: 28rem; }
  .actions { display: flex; gap: 0.75rem; }
  a { display: inline-block; padding: 0.6rem 1.4rem; font-size: 0.8125rem; letter-spacing: 0.08em; text-decoration: none; }
  a.primary { background: #2c2c2c; color: #fff; }
  a.secondary { border: 1px solid rgba(44, 44, 44, 0.25); color: #2c2c2c; }
  .code { margin-top: 2rem; font-size: 0.6875rem; color: #9ca3af; }
</style>
</head>
<body>
<main>
  <h1>登录失败</h1>
  <p>${safeDescription}</p>
  <div class="actions">
    <a class="primary" href="/">重新登录</a>
    <a class="secondary" href="/">返回首页</a>
  </div>
  <p class="code">错误码：${safeError}（反馈问题时请附上）</p>
</main>
</body>
</html>`;
}

/** 错误响应：自定义渲染 > HTML（浏览器）> JSON（API/自动化） */
function buildErrorResponse(
  request: NextRequest,
  status: number,
  error: string,
  errorDescription: string,
  custom?: CallbackRouteConfig["renderErrorPage"]
): NextResponse | Promise<NextResponse> {
  if (custom) {
    const handled = custom({ error, errorDescription, status, request });
    if (handled instanceof Promise) {
      return handled.then((res) =>
        res
          ? toNextResponse(res)
          : defaultErrorResponse(request, status, error, errorDescription)
      );
    }
    if (handled) return toNextResponse(handled);
  }
  return defaultErrorResponse(request, status, error, errorDescription);
}

/** 将自定义 Response 包装为 NextResponse（GET 包装层需要改写 cookies 清 nonce） */
function toNextResponse(res: Response): NextResponse {
  if (res instanceof NextResponse) return res;
  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

function defaultErrorResponse(
  request: NextRequest,
  status: number,
  error: string,
  errorDescription: string
): NextResponse {
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml =
    accept.includes("text/html") && request.nextUrl.searchParams.get("format") !== "json";
  if (wantsHtml) {
    return new NextResponse(buildErrorPage(status, error, errorDescription), {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({ error, error_description: errorDescription }, { status });
}

// ============================================
// Route Handler 工厂函数
// ============================================

export function createCallbackRouteHandler(config: CallbackRouteConfig) {
  const {
    clientId,
    ssoBaseUrl,
    redirectUri,
    clientSecret,
    defaultReturnPath = "/",
    scopes,
    insecureLocalDev: insecureLocalDevOpt = false,
  } = config;

  // 生产守卫：NODE_ENV=production 且 ssoBaseUrl 为 https 时强制忽略该开关（与 middleware 一致）
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);

  // insecureLocalDev：与 middleware 一致地去前缀 + 关 Secure，否则读不到 state/verifier
  const secureCookies = !insecureLocalDev;
  const pickName = (explicit: string | undefined, fallback: string) =>
    insecureLocalDev ? toInsecureCookieName(explicit ?? fallback) : explicit ?? fallback;
  const accessTokenCookieName = pickName(config.accessTokenCookieName, DEFAULT_ACCESS_TOKEN_COOKIE_NAME);
  const refreshTokenCookieName = pickName(config.refreshTokenCookieName, DEFAULT_REFRESH_TOKEN_COOKIE_NAME);
  const idTokenCookieName = pickName(config.idTokenCookieName, DEFAULT_ID_TOKEN_COOKIE_NAME);
  const stateCookieName = pickName(config.stateCookieName, DEFAULT_STATE_COOKIE_NAME);
  const nonceCookieName = pickName(config.nonceCookieName, DEFAULT_NONCE_COOKIE_NAME);
  const returnUrlCookieName = pickName(config.returnUrlCookieName, DEFAULT_RETURN_COOKIE_NAME);
  const verifierCookieName = pickName(config.verifierCookieName, DEFAULT_VERIFIER_COOKIE_NAME);

  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");
  // 服务器间调用（token 交换）的基准地址：配置了内网地址时走内网
  const normalizedServerBase = (config.serverBaseUrl ?? ssoBaseUrl).replace(/\/+$/, "");

  return async function GET(request: NextRequest) {
    const response = await handleCallback(request);
    // 错误路径（4xx/5xx）统一清除 nonce cookie，避免残留；
    // 成功路径在重定向响应中随 state/returnUrl cookie 一并清除
    if (response.status >= 400) {
      if (config.debug) {
        console.warn(
          `[SSO SDK] 回调失败 status=${response.status}`,
          request.nextUrl.searchParams.get("error") ?? ""
        );
      }
      response.cookies.set(nonceCookieName, "", getHostCookieOptions(0, secureCookies));
      const returnedState = request.nextUrl.searchParams.get("state");
      if (returnedState && /^[A-Za-z0-9\-._~]{8,512}$/.test(returnedState)) {
        response.cookies.set(
          `${nonceCookieName}_${returnedState}`,
          "",
          getHostCookieOptions(0, secureCookies)
        );
      }
    }
    return response;
  };

  async function handleCallback(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = request.nextUrl;

    // 检查错误
    const error = searchParams.get("error");
    if (error) {
      const desc = searchParams.get("error_description") || error;
      return buildErrorResponse(
        request,
        400,
        "authorization_failed",
        desc,
        config.renderErrorPage
      );
    }

    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");

    if (!code) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "登录信息不完整，请重新发起登录",
        config.renderErrorPage
      );
    }

    // 验证 state（从 cookie 中读取原始 state，CSRF 必需）。
    // state 同时是瞬态 cookie 的名称后缀，先做字符集/长度校验（middleware 生成 32 位；
    // 放宽下限仅为兼容测试/自定义 state，安全性由下方常量时间比较保证）
    if (!returnedState || !/^[A-Za-z0-9\-._~]{8,512}$/.test(returnedState)) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "State 参数缺失或格式非法，请重新发起授权请求",
        config.renderErrorPage
      );
    }
    const attemptSuffix = `_${returnedState}`;
    // 瞬态 cookie 按 state 隔离读取；旧固定名称仅作滚动升级过渡期回退
    const readTransientCookie = (name: string): string | undefined =>
      request.cookies.get(`${name}${attemptSuffix}`)?.value ??
      request.cookies.get(name)?.value;

    const savedState = readTransientCookie(stateCookieName);
    if (!savedState) {
      // 配置一致性诊断：若以"另一种命名口径"存在的 state cookie，说明
      // insecureLocalDev/Cookie 名称在 middleware 与 callback 之间不一致（最常见错配，
      // 表现为登录成功却被判未登录/无限跳转），给出针对性错误而非泛化的 state 缺失
      const alternateName = secureCookies
        ? toInsecureCookieName(stateCookieName)
        : DEFAULT_STATE_COOKIE_NAME;
      const alternateValue =
        request.cookies.get(`${alternateName}${attemptSuffix}`)?.value ??
        request.cookies.get(alternateName)?.value;
      if (alternateValue) {
        return buildErrorResponse(
          request,
          500,
          "invalid_config",
          "检测到 SSO SDK 配置不一致：middleware 与 callback 的 insecureLocalDev 或 Cookie 名称不匹配，请统一配置",
          config.renderErrorPage
        );
      }
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "登录会话已失效，请重新发起授权请求",
        config.renderErrorPage
      );
    }
    // state 比较使用常量时间比较（与 core/SsoClient.handleCallback 一致，防时序侧信道）
    if (!timingSafeEqualString(returnedState, savedState)) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "登录会话校验失败，请重新发起授权请求",
        config.renderErrorPage
      );
    }

    // 读取 middleware 发起授权时写入的 OIDC nonce（httpOnly cookie）。
    // cookie 存在时 validateIdToken 会 fail-closed 校验 ID Token 的 nonce claim
    const expectedNonce = readTransientCookie(nonceCookieName);

    // 读取 PKCE code_verifier（middleware 存入的 httpOnly cookie）
    const verifier = readTransientCookie(verifierCookieName);
    if (!verifier) {
      return buildErrorResponse(
        request,
        400,
        "invalid_request",
        "登录会话已过期（可能切换了标签页），请重新发起登录",
        config.renderErrorPage
      );
    }

    // 交换 token（服务器间调用：配置了 serverBaseUrl 时走内网直连）
    const tokenEndpoint = `${normalizedServerBase}/api/oauth/token`;
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("client_id", clientId);
    body.set("redirect_uri", redirectUri);
    body.set("code_verifier", verifier);
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    // 带重试的 token 交换（1 次重试 + 指数退避）
    let res: Response | null = null;
    let lastError: unknown;
    const maxRetries = 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // 指数退避：1s * 2^attempt
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
      try {
        res = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt >= maxRetries) {
          return buildErrorResponse(
            request,
            502,
            "server_error",
            "登录服务暂时不可用（Token 请求失败），请稍后重试",
            config.renderErrorPage
          );
        }
      }
    }

    if (lastError || !res) {
      return buildErrorResponse(
        request,
        502,
        "server_error",
        "登录服务暂时不可用（Token 请求失败），请稍后重试",
        config.renderErrorPage
      );
    }

    if (!res.ok) {
      let errData: Record<string, unknown> = {};
      try {
        errData = await res.json();
      } catch { /* ignore */ }
      return buildErrorResponse(
        request,
        502,
        "token_request_failed",
        (errData.error_description as string) || `登录失败（Token 请求失败: HTTP ${res.status}），请稍后重试`,
        config.renderErrorPage
      );
    }

    const tokenData: {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token: string;
      id_token?: string;
    } = await res.json();

    // 服务端异常可能省略必要字段；不校验会把字符串 "undefined" 写进 cookie。
    // expires_in 必须为有限正数，否则 access_token cookie 的 maxAge 为 NaN
    // （退化为会话 cookie 甚至立即失效）。
    if (
      !tokenData.access_token ||
      !tokenData.refresh_token ||
      typeof tokenData.expires_in !== "number" ||
      !Number.isFinite(tokenData.expires_in) ||
      tokenData.expires_in <= 0
    ) {
      return buildErrorResponse(
        request,
        502,
        "server_error",
        "登录服务返回异常（Token 响应不完整），请稍后重试",
        config.renderErrorPage
      );
    }

    // OIDC fail-closed（仅在显式配置 scopes 且含 openid 时生效）：
    // 防止 nonce/at_hash 绑定校验被静默跳过。未显式配置 scope 的旧接入方保持兼容行为。
    const requiresIdToken =
      scopes !== undefined && scopes.split(" ").filter(Boolean).includes("openid");
    if (requiresIdToken && !tokenData.id_token) {
      return buildErrorResponse(
        request,
        400,
        "id_token_invalid",
        "登录校验失败，请重新发起登录",
        config.renderErrorPage
      );
    }

    // 在设置 Cookie 前预校验 ID Token：防止伪造 token 写入浏览器
    if (tokenData.id_token) {
      try {
        await validateIdToken(
          tokenData.id_token,
          tokenData.access_token,
          normalizedBase,
          clientId,
          { expectedNonce }
        );
      } catch (err) {
        return buildErrorResponse(
          request,
          400,
          "id_token_invalid",
          err instanceof Error && /[\u4e00-\u9fff]/.test(err.message)
            ? err.message
            : "登录校验失败，请重新发起登录",
          config.renderErrorPage
        );
      }
    }

    // 读取 return URL，并做开放重定向防护。
    // 可信 origin 与跳转基准一律取 redirectUri 的 origin（部署时配置的公网地址），
    // 而非 request.url / request.nextUrl.origin：Next standalone 部署下后者是进程
    // 监听地址（如 http://0.0.0.0:3002），反代场景会把用户重定向到不可达地址。
    const callbackOrigin = new URL(redirectUri).origin;
    const rawReturnUrl = readTransientCookie(returnUrlCookieName) || defaultReturnPath;
    const returnUrl = isTrustedReturnUrl(rawReturnUrl, callbackOrigin)
      ? rawReturnUrl
      : "/";

    // 重定向并设置 cookie
    const response = NextResponse.redirect(new URL(returnUrl, callbackOrigin));

    // 设置 access_token cookie (httpOnly, Secure, SameSite=Lax, Path=/)
    response.cookies.set(accessTokenCookieName, tokenData.access_token, {
      ...getHostCookieOptions(tokenData.expires_in, secureCookies),
    });

    // 设置 refresh_token cookie（使用服务端返回的过期时间动态计算）
    // 服务端 refresh_token 通常是 30 天，此处使用 expires_in 映射（若响应包含）
    // 回退到 30 天默认值
    const refreshMaxAge =
      (tokenData as Record<string, unknown>).refresh_expires_in != null
        ? (tokenData as Record<string, unknown>).refresh_expires_in as number
        : 30 * 24 * 60 * 60;

    response.cookies.set(refreshTokenCookieName, tokenData.refresh_token, {
      ...getHostCookieOptions(refreshMaxAge, secureCookies),
    });

    // 设置 id_token cookie，用于 RP-Initiated Logout 的 id_token_hint
    // 使用 ID Token 自身的过期时间（通常 1 小时），而非 refresh token 的 30 天
    if (tokenData.id_token) {
      let idTokenMaxAge = 3600; // 默认 1 小时
      try {
        const parts = tokenData.id_token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
          ) as { exp?: number };
          if (payload.exp && typeof payload.exp === "number") {
            // 已过期（剩余 <= 0）的 id_token 不写入 cookie，避免携带失效凭证登出
            idTokenMaxAge = payload.exp - Math.floor(Date.now() / 1000);
          }
        }
      } catch {
        // 解码失败，使用默认值
      }
      if (idTokenMaxAge > 0) {
        response.cookies.set(idTokenCookieName, tokenData.id_token, {
          ...getHostCookieOptions(idTokenMaxAge, secureCookies),
        });
      }
    }

    // 清除临时 cookies: state / nonce / return URL（同时清除本次 state 后缀名与旧固定名）
    for (const name of [stateCookieName, nonceCookieName, returnUrlCookieName]) {
      response.cookies.set(name, "", getHostCookieOptions(0, secureCookies));
      response.cookies.set(`${name}${attemptSuffix}`, "", getHostCookieOptions(0, secureCookies));
    }

    // 清除 PKCE verifier cookie，必须使用写入时的 path（callbackPath）
    // 由于 callback handler 不知道 middleware 的 callbackPath，这里保守地
    // 同时清除 path=/ 和 path=当前请求路径两种可能
    for (const path of ["/", request.nextUrl.pathname]) {
      response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, path, secureCookies));
      response.cookies.set(
        `${verifierCookieName}${attemptSuffix}`,
        "",
        getSecureCookieOptions(0, path, secureCookies)
      );
    }

    return response;
  }
}
