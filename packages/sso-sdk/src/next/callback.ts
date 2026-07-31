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
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  DEFAULT_ID_TOKEN_COOKIE_NAME,
  DEFAULT_STATE_COOKIE_NAME,
  DEFAULT_RETURN_COOKIE_NAME,
  DEFAULT_VERIFIER_COOKIE_NAME,
  getHostCookieOptions,
  getSecureCookieOptions,
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

  /** Return URL Cookie 名称，默认 __Host-nihplod_sso_return */
  returnUrlCookieName?: string;

  /** PKCE Verifier Cookie 名称，默认 __Secure-nihplod_sso_verifier */
  verifierCookieName?: string;
}

// ============================================
// 工具函数
// ============================================

/**
 * 校验回调后的 returnUrl 是否可信。
 * 仅允许：相对路径（且不以 // 开头）或与当前 origin 完全一致。
 */
function isTrustedReturnUrl(url: string, currentOrigin: string): boolean {
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    return new URL(url).origin === currentOrigin;
  } catch {
    return false;
  }
}

// ============================================
// ID Token 预校验（写 Cookie 之前）
// ============================================

interface JwksKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface Jwks {
  keys: JwksKey[];
}

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeJwtHeader(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = new TextDecoder().decode(base64UrlDecode(parts[0]));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchJwks(baseUrl: string): Promise<Jwks | null> {
  try {
    const res = await fetch(`${baseUrl}/api/oauth/jwks`);
    if (!res.ok) return null;
    return (await res.json()) as Jwks;
  } catch {
    return null;
  }
}

async function verifyRs256Signature(token: string, jwk: JwksKey): Promise<boolean> {
  try {
    const [headerB64, payloadB64, signature] = token.split(".");
    if (!signature || !jwk.n || !jwk.e) return false;

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: false },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = base64UrlDecode(signature);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes as unknown as BufferSource,
      data as unknown as BufferSource
    );
  } catch {
    return false;
  }
}

async function computeAtHash(accessToken: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(accessToken)
  );
  const bytes = new Uint8Array(hash);
  const half = bytes.slice(0, bytes.length / 2);
  let binary = "";
  for (const b of half) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 在设置 Cookie 前校验 ID Token 基本声明与签名。
 * HS256 场景下无法验证签名（Confidential/BFF 应配置 RS256），仅校验声明与 at_hash。
 */
async function validateIdToken(
  idToken: string,
  accessToken: string,
  expectedIssuer: string,
  expectedClientId: string
): Promise<void> {
  const header = decodeJwtHeader(idToken);
  if (!header) throw new Error("ID Token 格式错误");

  const alg = header.alg;
  if (typeof alg !== "string" || (alg !== "RS256" && alg !== "HS256")) {
    throw new Error(`不支持的 ID Token 签名算法: ${alg}`);
  }

  if (alg === "RS256") {
    const jwks = await fetchJwks(expectedIssuer);
    if (!jwks) throw new Error("无法获取 JWKS");
    const kid = typeof header.kid === "string" ? header.kid : undefined;
    const key = jwks.keys.find(
      (k) =>
        k.kty === "RSA" &&
        k.alg === "RS256" &&
        k.use === "sig" &&
        (kid ? k.kid === kid : true)
    );
    if (!key) throw new Error("JWKS 中未找到匹配公钥");
    const valid = await verifyRs256Signature(idToken, key);
    if (!valid) throw new Error("ID Token 签名验证失败");
  }

  // HS256：对称密钥无法在 BFF 侧安全验证签名，若 SSO 已配置 RS256 则拒绝 HS256
  if (alg === "HS256") {
    // 仅当 SSO 尚未配置 RS256 时才接受 HS256（兼容过渡期）
    const jwks = await fetchJwks(expectedIssuer);
    const hasRs256 = jwks?.keys?.some((k) => k.alg === "RS256" && k.use === "sig");
    if (hasRs256) {
      throw new Error("SSO 已配置 RS256，拒绝 HS256 ID Token");
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[SSO SDK/Next] ID Token 使用 HS256 签名。建议主站启用 RS256 以获得完整签名验证。"
    );
  }

  const payload = decodeJwtPayload(idToken);
  if (!payload) throw new Error("ID Token payload 解析失败");

  const normalizedIssuer = expectedIssuer.replace(/\/+$/, "");
  const tokenIssuer =
    typeof payload.iss === "string" ? payload.iss.replace(/\/+$/, "") : "";
  if (tokenIssuer !== normalizedIssuer) {
    throw new Error("ID Token issuer 不匹配");
  }

  const aud = payload.aud;
  const audArr = Array.isArray(aud) ? aud : [aud];
  if (!audArr.includes(expectedClientId)) {
    throw new Error("ID Token audience 不匹配");
  }

  if (typeof payload.exp === "number" && Date.now() >= payload.exp * 1000) {
    throw new Error("ID Token 已过期");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("ID Token 缺少 sub");
  }

  if (typeof payload.at_hash === "string" && payload.at_hash) {
    const actual = await computeAtHash(accessToken);
    if (actual !== payload.at_hash) {
      throw new Error("ID Token at_hash 不匹配");
    }
  }
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
    accessTokenCookieName = DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
    refreshTokenCookieName = DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
    idTokenCookieName = DEFAULT_ID_TOKEN_COOKIE_NAME,
    stateCookieName = DEFAULT_STATE_COOKIE_NAME,
    returnUrlCookieName = DEFAULT_RETURN_COOKIE_NAME,
    verifierCookieName = DEFAULT_VERIFIER_COOKIE_NAME,
  } = config;

  const normalizedBase = ssoBaseUrl.replace(/\/+$/, "");

  return async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;

    // 检查错误
    const error = searchParams.get("error");
    if (error) {
      const desc = searchParams.get("error_description") || error;
      return NextResponse.json(
        { error: "authorization_failed", error_description: desc },
        { status: 400 }
      );
    }

    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");

    if (!code) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "缺少 authorization code",
        },
        { status: 400 }
      );
    }

    // 验证 state（从 cookie 中读取原始 state，CSRF 必需）
    const savedState = request.cookies.get(stateCookieName)?.value;
    if (!savedState) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "State 参数缺失，请重新发起授权请求",
        },
        { status: 400 }
      );
    }
    if (returnedState !== savedState) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "State 参数不匹配，可能存在 CSRF 攻击",
        },
        { status: 400 }
      );
    }

    // 读取 PKCE code_verifier（middleware 存入的 httpOnly cookie）
    const verifier = request.cookies.get(verifierCookieName)?.value;
    if (!verifier) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "PKCE verifier 缺失，请重新发起授权请求",
        },
        { status: 400 }
      );
    }

    // 交换 token
    const tokenEndpoint = `${normalizedBase}/api/oauth/token`;
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
    let res: Response;
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
          return NextResponse.json(
            { error: "server_error", error_description: "Token 请求失败，已重试仍不可达" },
            { status: 502 }
          );
        }
      }
    }

    if (lastError || !res!) {
      return NextResponse.json(
        { error: "server_error", error_description: "Token 请求失败" },
        { status: 502 }
      );
    }

    if (!res.ok) {
      let errData: Record<string, unknown> = {};
      try {
        errData = await res.json();
      } catch { /* ignore */ }
      return NextResponse.json(
        {
          error: "token_request_failed",
          error_description:
            (errData.error_description as string) || `Token 请求失败: HTTP ${res.status}`,
        },
        { status: 502 }
      );
    }

    const tokenData: {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token: string;
      id_token?: string;
    } = await res.json();

    // 在设置 Cookie 前预校验 ID Token：防止伪造 token 写入浏览器
    if (tokenData.id_token) {
      try {
        await validateIdToken(
          tokenData.id_token,
          tokenData.access_token,
          normalizedBase,
          clientId
        );
      } catch (err) {
        return NextResponse.json(
          {
            error: "id_token_invalid",
            error_description: err instanceof Error ? err.message : "ID Token 验证失败",
          },
          { status: 400 }
        );
      }
    }

    // 读取 return URL，并做开放重定向防护
    const rawReturnUrl =
      request.cookies.get(returnUrlCookieName)?.value || defaultReturnPath;
    const returnUrl = isTrustedReturnUrl(rawReturnUrl, request.nextUrl.origin)
      ? rawReturnUrl
      : "/";

    // 重定向并设置 cookie
    const response = NextResponse.redirect(new URL(returnUrl, request.url));

    // 设置 access_token cookie (httpOnly, Secure, SameSite=Lax, Path=/)
    response.cookies.set(accessTokenCookieName, tokenData.access_token, {
      ...getHostCookieOptions(tokenData.expires_in),
    });

    // 设置 refresh_token cookie（使用服务端返回的过期时间动态计算）
    // 服务端 refresh_token 通常是 30 天，此处使用 expires_in 映射（若响应包含）
    // 回退到 30 天默认值
    const refreshMaxAge =
      (tokenData as Record<string, unknown>).refresh_expires_in != null
        ? (tokenData as Record<string, unknown>).refresh_expires_in as number
        : 30 * 24 * 60 * 60;

    response.cookies.set(refreshTokenCookieName, tokenData.refresh_token, {
      ...getHostCookieOptions(refreshMaxAge),
    });

    // 设置 id_token cookie，用于 RP-Initiated Logout 的 id_token_hint
    if (tokenData.id_token) {
      response.cookies.set(idTokenCookieName, tokenData.id_token, {
        ...getHostCookieOptions(refreshMaxAge),
      });
    }

    // 清除临时 cookies: state / return URL
    response.cookies.set(stateCookieName, "", getHostCookieOptions(0));
    response.cookies.set(returnUrlCookieName, "", getHostCookieOptions(0));

    // 清除 PKCE verifier cookie，必须使用写入时的 path（callbackPath）
    // 由于 callback handler 不知道 middleware 的 callbackPath，这里保守地
    // 同时清除 path=/ 和 path=当前请求路径两种可能
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, "/"));
    response.cookies.set(verifierCookieName, "", getSecureCookieOptions(0, request.nextUrl.pathname));

    return response;
  };
}
