/**
 * Next.js Middleware 辅助函数
 *
 * 在 Edge Runtime 中运行，自动检测未认证请求并重定向到 SSO 登录页。
 *
 * ⚠️ Edge Runtime 限制：
 * - 不能使用 Node.js crypto 模块
 * - PKCE code_challenge 使用 Web Crypto API 的 crypto.subtle.digest(SHA-256)
 *   （Edge Runtime 18+ 完全支持此 API）
 *
 * 用法 (src/middleware.ts):
 * ```ts
 * import { createSsoMiddleware } from "@nihplod/sso-sdk/next";
 *
 * export const middleware = createSsoMiddleware({
 *   clientId: "my-app",
 *   ssoBaseUrl: "https://nihplod.cn",
 *   redirectUri: "https://myapp.com/api/auth/callback",
 *   publicPaths: ["/", "/public", "/api/public"],
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
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

export interface SsoMiddlewareConfig {
  /** OAuth Client ID */
  clientId: string;

  /** SSO 中心地址 */
  ssoBaseUrl: string;

  /** 回调 URL（须与注册的 redirect_uri 一致） */
  redirectUri: string;

  /** 请求的 scope（空格分隔），默认 "openid profile" */
  scopes?: string;

  /** 公开路由前缀（不需要认证） */
  publicPaths?: string[];

  /** 回调路径（不触发重定向），默认 "/api/auth/callback" */
  callbackPath?: string;

  /**
   * 主站用户会话 Cookie 名称，用于检测是否已有 SSO 会话。
   * 默认 "__Host-user_token"（与主站 C 端登录 Cookie 一致）。
   */
  ssoCookieName?: string;

  /**
   * OAuth Client Secret（Confidential Client 使用）
   * 浏览器端 Public Client 应省略。
   */
  clientSecret?: string;

  /**
   * 是否对 ssoCookieName 对应的主站 Cookie 进行 Introspection 二次验证。
   * 默认 true（推荐）。设为 false 时仅检查 Cookie 存在性，延迟最低但可能放行
   * 已失效/被撤销的会话 —— 中间件本质上只是 UX 层，敏感数据必须在
   * Route Handler / Server Component 中二次校验。
   */
  validateSsoCookie?: boolean;

  /** Access Token Cookie 名称，默认 __Host-nihplod_sso_at */
  accessTokenCookieName?: string;

  /** State Cookie 名称，默认 __Host-nihplod_sso_state */
  stateCookieName?: string;

  /** Return URL Cookie 名称，默认 __Host-nihplod_sso_return */
  returnUrlCookieName?: string;

  /** PKCE Verifier Cookie 名称，默认 __Secure-nihplod_sso_verifier */
  verifierCookieName?: string;

  /**
   * 本地 HTTP 开发模式（默认 false）。
   *
   * ⚠️ 仅限 http://localhost 开发：关闭 Cookie 的 Secure 属性并去除
   * __Host-/__Secure- 前缀（浏览器拒绝在 HTTP 下写入带这两个前缀的 Cookie，
   * 否则会出现「登录后 cookie 写不进去 → middleware 永远判定未登录 →
   * 反复跳 SSO」的无限重定向）。开启时启动告警；生产环境严禁启用——
   * 生产环境（NODE_ENV=production 且 ssoBaseUrl 为 https）下该开关会被
   * 强制忽略并告警，仍走 secure cookie。
   * middleware / callback / logout 三处配置需保持一致。
   */
  insecureLocalDev?: boolean;
}

// ============================================
// 工具函数
// ============================================

/**
 * 生成安全随机字符串（Edge Runtime 兼容）
 * 使用 crypto.getRandomValues（Edge Runtime 支持）
 * 拒绝采样法保证 charset 均匀分布
 */
function generateRandomString(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const maxValid = Math.floor(256 / chars.length) * chars.length;
  let result = "";

  while (result.length < length) {
    const array = new Uint8Array(length * 2);
    crypto.getRandomValues(array);
    for (let i = 0; i < array.length && result.length < length; i++) {
      if (array[i] >= maxValid) continue;
      result += chars[array[i] % chars.length];
    }
  }
  return result;
}

/**
 * 计算 PKCE S256 code_challenge（Edge Runtime 兼容）
 *
 * 使用 Web Crypto API 的 crypto.subtle.digest("SHA-256")，
 * Edge Runtime 18+ 完全支持。
 */
async function computeCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 路径匹配（支持 /:path* 通配符）
 */
function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) => {
    if (pathname === path) return true;
    if (path.endsWith("/:path*") && pathname.startsWith(path.replace("/:path*", ""))) return true;
    if (pathname.startsWith(path + "/")) return true;
    return false;
  });
}

/**
 * 通过主站 Introspection 端点校验 access_token 是否仍有效。
 * Confidential Client（BFF）应配置 clientSecret，防止伪造 Cookie 绕过。
 *
 * 附带进程级缓存（key = token 的 SHA-256 hex + clientId），
 * 减少同一用户 session 在短时间内对 SSO 中心的重复 introspection 调用。
 * 缓存带 TTL（30s）与容量上限（LRU 淘汰），避免无界增长。
 */
const introspectionCache = new Map<string, { active: boolean; until: number }>();
const INTROSPECT_CACHE_TTL_MS = 30_000; // 30 秒
const INTROSPECT_CACHE_MAX_ENTRIES = 500;

/** 计算 token 的 SHA-256 hex（Edge Runtime Web Crypto），用作缓存 key 避免跨用户碰撞 */
async function introspectCacheKey(token: string, clientId: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex}|${clientId}`;
}

/** 读取缓存（命中时刷新插入顺序，实现 LRU） */
function introspectCacheGet(key: string): { active: boolean; until: number } | null {
  const entry = introspectionCache.get(key);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    introspectionCache.delete(key);
    return null;
  }
  // LRU：重新插入到 Map 尾部
  introspectionCache.delete(key);
  introspectionCache.set(key, entry);
  return entry;
}

/** 写入缓存（先清过期项，再按插入顺序淘汰最旧项） */
function introspectCacheSet(key: string, active: boolean): void {
  const now = Date.now();
  for (const [k, v] of introspectionCache) {
    if (v.until <= now) introspectionCache.delete(k);
  }
  while (introspectionCache.size >= INTROSPECT_CACHE_MAX_ENTRIES) {
    const oldest = introspectionCache.keys().next();
    if (oldest.done) break;
    introspectionCache.delete(oldest.value);
  }
  introspectionCache.set(key, { active, until: now + INTROSPECT_CACHE_TTL_MS });
}

async function introspectAccessToken(
  token: string,
  ssoBaseUrl: string,
  clientId: string,
  clientSecret?: string
): Promise<boolean> {
  const cacheKey = await introspectCacheKey(token, clientId);
  const cached = introspectCacheGet(cacheKey);
  if (cached) {
    return cached.active;
  }

  try {
    const body = new URLSearchParams({
      token,
      token_type_hint: "access_token",
      client_id: clientId,
    });
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    const res = await fetch(`${ssoBaseUrl}/api/oauth/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      // 仅缓存确定性的"token 无效"结果；网络错误不缓存，下次重试
      if (res.status !== 401 && res.status !== 403) {
        // 非认证错误（如 500、网络问题）：不缓存，让下次请求重试
        return false;
      }
      introspectCacheSet(cacheKey, false);
      return false;
    }
    const data = (await res.json()) as { active?: boolean };
    const active = data.active === true;
    introspectCacheSet(cacheKey, active);
    return active;
  } catch {
    // 网络异常不缓存：下次请求会重试 introspection
    return false;
  }
}

// ============================================
// Middleware 工厂函数
// ============================================

export function createSsoMiddleware(config: SsoMiddlewareConfig) {
  const {
    clientId,
    clientSecret,
    ssoBaseUrl,
    redirectUri,
    scopes = "openid profile",
    publicPaths = [],
    callbackPath = "/api/auth/callback",
    ssoCookieName = "__Host-user_token",
    validateSsoCookie = true,
    insecureLocalDev: insecureLocalDevOpt = false,
  } = config;

  // 生产守卫：NODE_ENV=production 且 ssoBaseUrl 为 https 时强制忽略该开关（仍走 secure cookie）
  const insecureLocalDev = resolveInsecureLocalDev(insecureLocalDevOpt, ssoBaseUrl);

  // insecureLocalDev：HTTP 本地开发下去除 Cookie 前缀（浏览器拒绝无 Secure 的前缀 Cookie）
  const secureCookies = !insecureLocalDev;
  const accessTokenCookieName = insecureLocalDev
    ? toInsecureCookieName(config.accessTokenCookieName ?? DEFAULT_ACCESS_TOKEN_COOKIE_NAME)
    : config.accessTokenCookieName ?? DEFAULT_ACCESS_TOKEN_COOKIE_NAME;
  const stateCookieName = insecureLocalDev
    ? toInsecureCookieName(config.stateCookieName ?? DEFAULT_STATE_COOKIE_NAME)
    : config.stateCookieName ?? DEFAULT_STATE_COOKIE_NAME;
  const returnUrlCookieName = insecureLocalDev
    ? toInsecureCookieName(config.returnUrlCookieName ?? DEFAULT_RETURN_COOKIE_NAME)
    : config.returnUrlCookieName ?? DEFAULT_RETURN_COOKIE_NAME;
  const verifierCookieName = insecureLocalDev
    ? toInsecureCookieName(config.verifierCookieName ?? DEFAULT_VERIFIER_COOKIE_NAME)
    : config.verifierCookieName ?? DEFAULT_VERIFIER_COOKIE_NAME;

  // 规范化 ssoBaseUrl
  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");

  if (process.env.NODE_ENV !== "production") {
    if (!validateSsoCookie) {
      console.warn(
        "[SSO SDK] validateSsoCookie=false：中间件仅检查 Cookie 存在性，可能放行已失效的会话。" +
        "中间件只是 UX 层，敏感数据的鉴权必须在 Route Handler / Server Component 中完成。"
      );
    }
    if (!clientSecret) {
      console.warn(
        "[SSO SDK] 未配置 clientSecret（Public Client 模式）：introspection 无客户端认证，" +
        "中间件判定结果仅作 UX 参考。Confidential Client（BFF）请配置 clientSecret。"
      );
    }
  }

  return async function ssoMiddleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Exclude Next.js internal routes and static assets
    if (
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/favicon.ico") ||
      pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)
    ) {
      return NextResponse.next();
    }

    // Callback path: let the callback handler deal with it
    if (pathname === callbackPath) {
      return NextResponse.next();
    }

    // Public paths: no auth required
    const allPublicPaths = [callbackPath, ...publicPaths];
    if (matchesPath(pathname, allPublicPaths)) {
      return NextResponse.next();
    }

    // Check for existing SSO session
    const ssoSession = request.cookies.get(ssoCookieName);
    if (ssoSession?.value) {
      // 可选：对主站 Cookie 进行 Introspection 二次验证
      if (validateSsoCookie) {
        const tokenActive = await introspectAccessToken(
          ssoSession.value,
          normalizedBase,
          clientId,
          clientSecret
        );
        if (tokenActive) {
          return NextResponse.next();
        }
        // Token 无效：继续到 access_token cookie 检查或重定向
      } else {
        return NextResponse.next();
      }
    }

    // Check for access_token in cookie (set by callback handler)
    const accessTokenCookie = request.cookies.get(accessTokenCookieName);
    if (accessTokenCookie?.value) {
      // 调用 Introspection 精确校验 token 是否仍有效。
      // Confidential Client 携带 clientSecret；Public Client 仅传 clientId。
      const tokenActive = await introspectAccessToken(
        accessTokenCookie.value,
        normalizedBase,
        clientId,
        clientSecret
      );

      if (tokenActive) {
        return NextResponse.next();
      }
      // Token 无效或已过期：清除 cookie 并继续到 SSO 重定向
    }

    // No auth: redirect to SSO
    const state = generateRandomString(32);
    const verifier = generateRandomString(64);

    // 在 Edge Runtime 中计算 PKCE code_challenge（SHA-256 + base64url）
    const challenge = await computeCodeChallenge(verifier);

    const authorizeParams = new URLSearchParams();
    authorizeParams.set("response_type", "code");
    authorizeParams.set("client_id", clientId);
    authorizeParams.set("redirect_uri", redirectUri);
    authorizeParams.set("scope", scopes);
    authorizeParams.set("state", state);
    authorizeParams.set("code_challenge", challenge);
    authorizeParams.set("code_challenge_method", "S256");

    const loginUrl = new URL("/api/oauth/authorize", normalizedBase);
    loginUrl.search = authorizeParams.toString();

    const response = NextResponse.redirect(loginUrl);

    // Set state cookie for CSRF verification on callback
    response.cookies.set(stateCookieName, state, getHostCookieOptions(600, secureCookies));

    // Set PKCE verifier cookie（httpOnly，供 callback handler 使用）
    // 使用 __Secure- 前缀，允许写入 callbackPath
    response.cookies.set(verifierCookieName, verifier, getSecureCookieOptions(600, callbackPath, secureCookies));

    // Set return URL cookie（仅存储 pathname + search，截断至安全长度）
    const safeReturnUrl = (request.nextUrl.pathname + request.nextUrl.search).slice(0, 2048);
    response.cookies.set(returnUrlCookieName, safeReturnUrl, getHostCookieOptions(600, secureCookies));

    // 如果存在过期的 access_token cookie，立即清除
    if (accessTokenCookie?.value) {
      response.cookies.set(accessTokenCookieName, "", getHostCookieOptions(0, secureCookies));
    }

    return response;
  };
}
