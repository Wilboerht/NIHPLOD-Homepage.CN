/**
 * SSO Client 核心类
 *
 * 封装完整的 OAuth 2.0 授权码 + PKCE S256 流程：
 * - login(): 发起授权请求
 * - handleCallback(): 处理回调，交换 token
 * - refreshToken(): 刷新 access token（原子轮换）
 * - getUserInfo(): 获取用户信息
 * - logout(): 登出
 * - isAuthenticated(): 检查认证状态
 */

import { SsoError } from "./errors";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "./pkce";
import {
  saveTokenData,
  getTokenData,
  removeTokenData,
  savePkceVerifier,
  getPkceVerifier,
  removePkceVerifier,
  saveOAuthState,
  getOAuthState,
  removeOAuthState,
  saveReturnUrl,
  getReturnUrl,
  removeReturnUrl,
  clearAllSsoData,
  type TokenData,
} from "./storage";

// ============================================
// ID Token 验证辅助函数（浏览器原生 Web Crypto）
// ============================================

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

/** 解码 JWT payload（不验证签名） */
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

/** 解码 JWT header */
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

/** 标准化 issuer/base URL，去除末尾斜杠 */
function normalizeIssuer(url: string): string {
  return url.replace(/\/+$/, "");
}

interface JwksKey {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  x5c?: string[];
}

interface Jwks {
  keys: JwksKey[];
}

let cachedJwks: { baseUrl: string; jwks: Jwks; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/** 从 SSO 中心拉取 JWKS */
async function fetchJwks(baseUrl: string): Promise<Jwks | null> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.baseUrl === baseUrl && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.jwks;
  }

  try {
    const res = await fetch(`${baseUrl}/api/oauth/jwks`);
    if (!res.ok) return null;
    const jwks = (await res.json()) as Jwks;
    cachedJwks = { baseUrl, jwks, fetchedAt: now };
    return jwks;
  } catch {
    return null;
  }
}

/** 计算 OIDC at_hash（access_token SHA-256 前 128bit base64url） */
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

/** 使用 RS256 公钥验证 ID Token 签名 */
async function verifyRs256(token: string, jwk: JwksKey): Promise<boolean> {
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

/** 验证 ID Token（iss、aud、exp、sub、签名、at_hash） */
async function validateIdToken(
  idToken: string,
  expectedIssuer: string,
  expectedClientId: string,
  accessToken: string
) {
  const header = decodeJwtHeader(idToken);
  if (!header) {
    throw new SsoError("id_token_invalid", "ID Token 格式错误");
  }

  const alg = header.alg;
  if (typeof alg !== "string" || (alg !== "RS256" && alg !== "HS256")) {
    throw new SsoError("id_token_unsupported_alg", `不支持的 ID Token 签名算法: ${alg}`);
  }

  // RS256：通过 JWKS 验证签名
  if (alg === "RS256") {
    const jwks = await fetchJwks(normalizeIssuer(expectedIssuer));
    if (!jwks) {
      throw new SsoError("id_token_invalid_signature", "无法获取 JWKS 验证 ID Token 签名");
    }
    const kid = typeof header.kid === "string" ? header.kid : undefined;
    const key = jwks.keys.find(
      (k) =>
        k.kty === "RSA" &&
        k.alg === "RS256" &&
        k.use === "sig" &&
        (kid ? k.kid === kid : true)
    );
    if (!key) {
      throw new SsoError("id_token_invalid_signature", "JWKS 中未找到匹配的 RS256 公钥");
    }
    const validSig = await verifyRs256(idToken, key);
    if (!validSig) {
      throw new SsoError("id_token_invalid_signature", "ID Token 签名验证失败");
    }
  }

  // HS256：对称密钥无法安全分发给 Public Client，因此仅校验声明、不校验签名。
  // Confidential Client 如确需验证签名，应迁移到 RS256。
  if (alg === "HS256") {
    // eslint-disable-next-line no-console
    console.warn(
      "[SSO SDK] ID Token 使用 HS256 签名，Public Client 无法安全验证签名。" +
        "建议主站配置 JWT_ID_TOKEN_PRIVATE_KEY / JWT_ID_TOKEN_PUBLIC_KEY 启用 RS256。"
    );
  }

  const payload = decodeJwtPayload(idToken);
  if (!payload) {
    throw new SsoError("id_token_invalid", "ID Token payload 解析失败");
  }

  const normalizedExpectedIssuer = normalizeIssuer(expectedIssuer);
  const tokenIssuer = typeof payload.iss === "string" ? normalizeIssuer(payload.iss) : "";
  if (tokenIssuer !== normalizedExpectedIssuer) {
    throw new SsoError("id_token_issuer_mismatch", "ID Token issuer 不匹配");
  }
  if (
    payload.aud !== expectedClientId &&
    !((payload.aud as string[] | undefined)?.includes(expectedClientId))
  ) {
    throw new SsoError("id_token_audience_mismatch", "ID Token audience 不匹配");
  }
  if (typeof payload.exp === "number" && Date.now() >= payload.exp * 1000) {
    throw new SsoError("id_token_expired", "ID Token 已过期");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new SsoError("id_token_missing_sub", "ID Token 缺少 sub");
  }

  // 校验 at_hash：确保 ID Token 与当前 access_token 绑定
  if (typeof payload.at_hash === "string" && payload.at_hash) {
    const actual = await computeAtHash(accessToken);
    if (actual !== payload.at_hash) {
      throw new SsoError("id_token_at_hash_mismatch", "ID Token at_hash 不匹配");
    }
  }

  return { sub: payload.sub };
}

// ============================================
// 类型定义
// ============================================

/** SSO 客户端配置 */
export interface SsoClientConfig {
  /** OAuth Client ID（从管理后台获取） */
  clientId: string;

  /** OAuth Client Secret（从管理后台获取）
   *
   * ⚠️ 安全提醒：client_secret 不应暴露在前端代码中。
   * 对于浏览器端 SPA（Public Client），应省略此字段；SDK 会使用 PKCE 完成授权，
   * 且 token 端点不会发送 client_secret。
   * 对于 BFF/Next.js 等 Confidential Client，可传入 client_secret。
   */
  clientSecret?: string;

  /** 回调 URL（必须与注册的 redirect_uri 完全一致） */
  redirectUri: string;

  /** SSO 中心地址，如 "https://nihplod.cn" */
  ssoBaseUrl: string;

  /** 请求的 scope（空格分隔），如 "openid profile phone" */
  scopes?: string;
}

/** 用户信息 */
export interface SsoUser {
  sub: string;
  nickname?: string;
  avatar?: string;
  phone?: string;
  membership_level?: string;
  total_points?: number;
}

/** Token 响应 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  id_token?: string;
}

/** OIDC Discovery 文档 */
export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  introspection_endpoint: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
}

// ============================================
// SsoClient
// ============================================

export class SsoClient {
  public readonly config: SsoClientConfig;
  private _discovery: OidcDiscovery | null = null;
  private _discoveryFetchedAt: number = 0;
  private _refreshLock: Promise<TokenData> | null = null;

  /** Discovery 文档缓存 TTL（5 分钟） */
  private static readonly DISCOVERY_TTL_MS = 5 * 60 * 1000;

  /** Discovery fetch 超时（10 秒） */
  private static readonly DISCOVERY_TIMEOUT_MS = 10000;

  constructor(config: SsoClientConfig) {
    if (!config.clientId) throw new SsoError("invalid_config", "clientId 不能为空");
    if (!config.redirectUri) throw new SsoError("invalid_config", "redirectUri 不能为空");
    if (!config.ssoBaseUrl) throw new SsoError("invalid_config", "ssoBaseUrl 不能为空");

    // 规范化 ssoBaseUrl：移除末尾斜杠
    const base = config.ssoBaseUrl.replace(/\/+$/, "");
    this.config = { ...config, ssoBaseUrl: base };
  }

  // ============================================
  // 内部方法
  // ============================================

  /**
   * 获取 OIDC Discovery 文档（带缓存 + 超时）
   *
   * 缓存 5 分钟，超时 10 秒。
   * 失败时返回 null（上层调用方回退到硬编码默认端点）。
   */
  private async _getDiscovery(): Promise<OidcDiscovery | null> {
    const now = Date.now();

    // 命中缓存且未过期
    if (
      this._discovery &&
      now - this._discoveryFetchedAt < SsoClient.DISCOVERY_TTL_MS
    ) {
      return this._discovery;
    }

    const url = `${this.config.ssoBaseUrl}/api/oauth/.well-known/openid-configuration`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        SsoClient.DISCOVERY_TIMEOUT_MS
      );

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(
          `[SSO SDK] OIDC Discovery 请求失败: HTTP ${res.status}, 回退到默认端点`
        );
        return null;
      }

      this._discovery = (await res.json()) as OidcDiscovery;
      this._discoveryFetchedAt = now;
      return this._discovery;
    } catch (err) {
      console.warn(
        `[SSO SDK] OIDC Discovery 请求异常: ${err instanceof Error ? err.message : String(err)}, 回退到默认端点`
      );
      // 不清空已有缓存（即使过期也优于无数据）
      return this._discovery || null;
    }
  }

  /** 获取 authorize 端点 URL（优先 Discovery，回退默认） */
  private async _getAuthorizeEndpoint(): Promise<string> {
    const d = await this._getDiscovery();
    if (d) return d.authorization_endpoint;
    return `${this.config.ssoBaseUrl}/api/oauth/authorize`;
  }

  /** 获取 token 端点 URL（优先 Discovery，回退默认） */
  private async _getTokenEndpoint(): Promise<string> {
    const d = await this._getDiscovery();
    if (d) return d.token_endpoint;
    return `${this.config.ssoBaseUrl}/api/oauth/token`;
  }

  /** 获取 userinfo 端点 URL（优先 Discovery，回退默认） */
  private async _getUserinfoEndpoint(): Promise<string> {
    const d = await this._getDiscovery();
    if (d) return d.userinfo_endpoint;
    return `${this.config.ssoBaseUrl}/api/oauth/userinfo`;
  }

  // ============================================
  // 公共 API
  // ============================================

  /**
   * 发起 SSO 登录
   *
   * 生成 PKCE code_verifier/code_challenge 和 state 参数，
   * 构建 authorize URL，通过 302 跳转到 SSO 登录页。
   *
   * @param returnUrl - 登录成功后的返回地址（可选，保存到 sessionStorage）
   */
  async login(returnUrl?: string): Promise<void> {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    // 保存 PKCE verifier 和 state 到 sessionStorage
    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);

    if (returnUrl) {
      saveReturnUrl(returnUrl);
    }

    // 构建 authorize URL
    const authorizeEndpoint = await this._getAuthorizeEndpoint();
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", this.config.clientId);
    params.set("redirect_uri", this.config.redirectUri);
    params.set("scope", this.config.scopes || "openid profile");
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");

    // 跳转
    window.location.href = `${authorizeEndpoint}?${params.toString()}`;
  }

  /**
   * 构建登录 URL（不跳转，返回 URL 字符串）
   *
   * 适用于需要手动处理跳转的场景。
   */
  async getLoginUrl(returnUrl?: string): Promise<string> {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    // 统一使用全局 returnUrl key，与 login() / CallbackPage 保持一致
    if (returnUrl) saveReturnUrl(returnUrl);

    const authorizeEndpoint = await this._getAuthorizeEndpoint();
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", this.config.clientId);
    params.set("redirect_uri", this.config.redirectUri);
    params.set("scope", this.config.scopes || "openid profile");
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");

    return `${authorizeEndpoint}?${params.toString()}`;
  }

  /**
   * 处理 OAuth 回调
   *
   * 解析回调 URL，校验 state 参数，用授权码交换 token。
   * 成功后 token 自动保存到 sessionStorage。
   *
   * @param callbackUrl - 完整的回调 URL（window.location.href）
   * @returns TokenData 或 null
   */
  async handleCallback(
    callbackUrl: string
  ): Promise<TokenData> {
    const url = new URL(callbackUrl);
    const params = url.searchParams;

    // 检查错误
    const error = params.get("error");
    if (error) {
      const desc = params.get("error_description") || error;
      throw new SsoError("token_request_failed", `授权失败: ${desc}`);
    }

    const code = params.get("code");
    const returnedState = params.get("state");

    if (!code) {
      throw new SsoError("token_request_failed", "回调 URL 中缺少 authorization code");
    }

    // 校验 state 参数（CSRF 防护）
    const savedState = getOAuthState(this.config.clientId);
    if (!savedState || savedState !== returnedState) {
      removeOAuthState(this.config.clientId);
      throw new SsoError(
        "state_mismatch",
        "State 参数不匹配，可能存在 CSRF 攻击"
      );
    }
    removeOAuthState(this.config.clientId);

    // 获取 code_verifier
    const verifier = getPkceVerifier(this.config.clientId);
    if (!verifier) {
      throw new SsoError(
        "pkce_required",
        "code_verifier 不存在（可能已过期或来自其他标签页）"
      );
    }
    removePkceVerifier(this.config.clientId);

    // 交换 token
    const tokenEndpoint = await this._getTokenEndpoint();
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("code_verifier", verifier);
    body.set("client_id", this.config.clientId);
    body.set("redirect_uri", this.config.redirectUri);
    if (this.config.clientSecret) {
      body.set("client_secret", this.config.clientSecret);
    }

    let res: Response;
    try {
      res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (err) {
      throw new SsoError("network_error", "网络请求失败", err);
    }

    if (!res.ok) {
      let errData: Record<string, unknown> = {};
      try { errData = await res.json(); } catch { /* ignore */ }
      throw new SsoError(
        "token_request_failed",
        (errData.error_description as string) || `Token 请求失败: HTTP ${res.status}`
      );
    }

    const data: TokenResponse = await res.json();

    // OIDC：验证 ID Token 签名、基本声明及 at_hash
    if (data.id_token) {
      try {
        await validateIdToken(
          data.id_token,
          this.config.ssoBaseUrl,
          this.config.clientId,
          data.access_token
        );
      } catch (err) {
        // 验证失败：不保存任何 token，防止伪造 ID Token
        removeTokenData(this.config.clientId);
        throw err;
      }
    }

    const now = Date.now();
    const tokenData: TokenData = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      id_token: data.id_token,
      issued_at: now,
      expires_at: now + data.expires_in * 1000,
    };

    saveTokenData(tokenData, this.config.clientId);
    return tokenData;
  }

  /**
   * 刷新 Access Token
   *
   * 使用 refresh_token 换取新的 access_token。
   * 采用互斥锁防止并发刷新。
   * 支持 Refresh Token 原子轮换。
   */
  async refreshToken(): Promise<TokenData> {
    // 互斥锁：避免并发刷新
    if (this._refreshLock) return this._refreshLock;

    this._refreshLock = this._doRefreshToken();
    try {
      return await this._refreshLock;
    } finally {
      this._refreshLock = null;
    }
  }

  private async _doRefreshToken(): Promise<TokenData> {
    const current = getTokenData(this.config.clientId);
    if (!current?.refresh_token) {
      throw new SsoError("no_refresh_token", "没有可用的 refresh_token");
    }

    const tokenEndpoint = await this._getTokenEndpoint();
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", current.refresh_token);
    body.set("client_id", this.config.clientId);
    if (this.config.clientSecret) {
      body.set("client_secret", this.config.clientSecret);
    }

    let res: Response;
    try {
      res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (err) {
      throw new SsoError("network_error", "刷新 Token 网络请求失败", err);
    }

    if (!res.ok) {
      let errData: Record<string, unknown> = {};
      try { errData = await res.json(); } catch { /* ignore */ }
      const errorCode = (errData.error as string) || "";
      // invalid_grant 表示 refresh_token 已被撤销或过期，应清除本地登录态
      if (errorCode === "invalid_grant" || res.status === 401) {
        removeTokenData(this.config.clientId);
      }
      throw new SsoError(
        errorCode === "invalid_grant" ? "session_expired" : "token_request_failed",
        (errData.error_description as string) || `刷新 Token 失败: HTTP ${res.status}`
      );
    }

    const data: TokenResponse = await res.json();
    const now = Date.now();
    const tokenData: TokenData = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token,
      id_token: data.id_token,
      issued_at: now,
      expires_at: now + data.expires_in * 1000,
    };

    saveTokenData(tokenData, this.config.clientId);
    return tokenData;
  }

  /**
   * 获取用户信息
   *
   * 若 access_token 已过期则自动刷新后再请求。
   */
  async getUserInfo(): Promise<SsoUser> {
    let tokenData = getTokenData(this.config.clientId);

    if (!tokenData) {
      throw new SsoError("not_authenticated", "未登录");
    }

    // 若已过期，先刷新
    if (Date.now() >= tokenData.expires_at) {
      tokenData = await this.refreshToken();
    }

    const userinfoEndpoint = await this._getUserinfoEndpoint();

    let res: Response;
    try {
      res = await fetch(userinfoEndpoint, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
    } catch (err) {
      throw new SsoError("network_error", "获取用户信息网络请求失败", err);
    }

    if (!res.ok) {
      if (res.status === 401) {
        removeTokenData(this.config.clientId);
        throw new SsoError("not_authenticated", "Token 已失效");
      }
      throw new SsoError(
        "userinfo_failed",
        `获取用户信息失败: HTTP ${res.status}`
      );
    }

    return (await res.json()) as SsoUser;
  }

  /**
   * 获取当前 access_token
   *
   * 若已过期则自动刷新。用于子项目自行发起 API 请求时获取 Bearer token。
   * 若无 token 返回 null；若刷新失败则抛出错误（与 getUserInfo 行为一致）。
   */
  async getAccessToken(): Promise<string | null> {
    let tokenData = getTokenData(this.config.clientId);
    if (!tokenData) return null;

    if (Date.now() >= tokenData.expires_at) {
      tokenData = await this.refreshToken();
    }

    return tokenData.access_token;
  }

  /**
   * 检查是否已认证（不发起网络请求）
   *
   * 仅检查本地是否存在未过期的 access_token。
   */
  isAuthenticated(): boolean {
    const tokenData = getTokenData(this.config.clientId);
    if (!tokenData) return false;
    return Date.now() < tokenData.expires_at;
  }

  /**
   * 登出
   *
   * 清除本地所有 token 和临时数据，并尝试撤销服务端 refresh_token。
   * @param redirectToSso - 是否重定向到 SSO 登出页（默认 false）
   */
  async logout(redirectToSso: boolean = false): Promise<void> {
    // 获取 refresh_token 用于服务端撤销（需在 clearAllSsoData 之前）
    const tokenData = getTokenData(this.config.clientId);
    const refreshToken = tokenData?.refresh_token;
    const idTokenHint = tokenData?.id_token;

    clearAllSsoData(this.config.clientId);

    // 尝试调用服务端 token revocation 端点（best-effort）
    // 仅 Confidential Client 携带 client_secret；Public Client 不传 secret。
    if (refreshToken && this.config.clientId) {
      try {
        const discovery = await this._getDiscovery();
        const revokeUrl =
          discovery?.revocation_endpoint ||
          `${this.config.ssoBaseUrl}/api/oauth/revoke`;
        const revokeBody = new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
          client_id: this.config.clientId,
        });
        if (this.config.clientSecret) {
          revokeBody.set("client_secret", this.config.clientSecret);
        }
        await fetch(revokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: revokeBody.toString(),
        });
      } catch {
        // 撤销失败不影响本地登出（best-effort）
      }
    }

    if (redirectToSso) {
      // OIDC RP-Initiated Logout：携带 client_id / post_logout_redirect_uri / id_token_hint / state
      const discovery = await this._getDiscovery();
      const endSessionEndpoint =
        discovery?.end_session_endpoint || `${this.config.ssoBaseUrl}/logout`;
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set("client_id", this.config.clientId);
      if (this.config.redirectUri) {
        logoutUrl.searchParams.set(
          "post_logout_redirect_uri",
          this.config.redirectUri
        );
      }
      if (idTokenHint) {
        logoutUrl.searchParams.set("id_token_hint", idTokenHint);
      }
      const state = generateState();
      logoutUrl.searchParams.set("state", state);
      window.location.href = logoutUrl.toString();
    }
  }

  /**
   * 获取 OIDC Discovery 文档
   *
   * 用于调试和获取 SSO 中心完整配置。
   * 可能返回 null（当 Discovery 端点不可达且无缓存时）。
   */
  async getDiscovery(): Promise<OidcDiscovery | null> {
    return this._getDiscovery();
  }
}
