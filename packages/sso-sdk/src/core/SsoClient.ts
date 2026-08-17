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

import { SsoError, mapOAuthErrorToSsoCode } from "./errors";
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
  saveLogoutState,
  getLogoutState,
  removeLogoutState,
  saveReturnUrl,
  clearAllSsoData,
  type TokenData,
} from "./storage";
import { validateIdToken } from "./id-token";
import { isTrustedReturnUrl, timingSafeEqualString } from "./security";

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

  /** RP-Initiated Logout 返回地址（可选）。不传时回退到 redirectUri */
  postLogoutRedirectUri?: string;
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

  /**
   * 开放重定向防护：仅保存相对路径或与当前页面同源的 returnUrl，
   * 其余（如 https://evil.com）忽略并告警，防止回调后跳转到钓鱼站点。
   */
  private _saveReturnUrlIfTrusted(returnUrl: string): void {
    if (isTrustedReturnUrl(returnUrl, window.location.origin)) {
      // 按 clientId 隔离存储，与 CallbackPage 读取的 key 对应
      saveReturnUrl(returnUrl, this.config.clientId);
    } else {
      console.warn(`[SSO SDK] returnUrl 未通过同源校验，已忽略: ${returnUrl}`);
    }
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
   * @param returnUrl - 登录成功后的返回地址（可选，保存到 sessionStorage；
   *   仅允许相对路径或同源绝对 URL，否则忽略并告警）
   *
   * ⚠️ 不要与 getLoginUrl() 混用：两者都会重新生成并覆盖 sessionStorage 中的
   * state / PKCE verifier，先调用的那次授权流程将因 state 不匹配而失败。
   * 同一次登录只使用其中一个入口。
   */
  async login(returnUrl?: string): Promise<void> {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    // 保存 PKCE verifier 和 state 到 sessionStorage（整页重定向后仍可读取）
    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);

    if (returnUrl) {
      this._saveReturnUrlIfTrusted(returnUrl);
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
   *
   * ⚠️ 不要与 login() 混用：两者都会重新生成并覆盖 sessionStorage 中的
   * state / PKCE verifier，先调用的那次授权流程将因 state 不匹配而失败。
   * 同一次登录只使用其中一个入口。
   */
  async getLoginUrl(returnUrl?: string): Promise<string> {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    // returnUrl 按 clientId 隔离，与 login() / CallbackPage 保持一致
    if (returnUrl) this._saveReturnUrlIfTrusted(returnUrl);

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
   * 弹窗模式 SSO 登录
   *
   * 打开一个小窗口进行登录，认证完成后窗口自动关闭，
   * 主页面不丢失状态（适用于 SPA 中需要保持表单/浏览上下文的场景）。
   *
   * 流程：
   * 1. window.open() 打开授权 URL 到弹窗
   * 2. 用户在弹窗中完成登录
   * 3. 弹窗加载 CallbackPage 时检测到 window.opener，通过 postMessage 回传回调 URL
   * 4. 主页面收到消息后调用 handleCallback() 交换 token
   * 5. 弹窗自动关闭
   *
   * @param options - 弹窗配置
   * @param options.returnUrl - 登录成功后的返回地址
   * @param options.width - 弹窗宽度（默认 480）
   * @param options.height - 弹窗高度（默认 640）
   * @returns TokenData
   *
   * @example
   * ```typescript
   * const client = new SsoClient({ clientId: "xxx", redirectUri: "https://myapp.com/callback", ssoBaseUrl: "https://nihplod.cn" });
   * try {
   *   const tokenData = await client.loginPopup({ returnUrl: "/dashboard" });
   *   console.log("登录成功", tokenData);
   * } catch (err) {
   *   if (err instanceof SsoError && err.code === "popup_blocked") {
   *     // 弹窗被拦截，回退到同页重定向
   *     await client.login("/dashboard");
   *   }
   * }
   * ```
   */
  async loginPopup(
    options: { returnUrl?: string; width?: number; height?: number } = {}
  ): Promise<TokenData> {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();
    const popupNonce = generateState(); // 独立的 nonce 用于 postMessage 来源验证

    savePkceVerifier(this.config.clientId, verifier);
    saveOAuthState(state, this.config.clientId);
    // 保存 popup nonce 到 sessionStorage，用于 postMessage 校验
    savePkceVerifier(`${this.config.clientId}_popup_nonce`, popupNonce);

    if (options.returnUrl) {
      this._saveReturnUrlIfTrusted(options.returnUrl);
    }

    const authorizeEndpoint = await this._getAuthorizeEndpoint();
    const params = new URLSearchParams();
    params.set("response_type", "code");
    params.set("client_id", this.config.clientId);
    params.set("redirect_uri", this.config.redirectUri);
    params.set("scope", this.config.scopes || "openid profile");
    params.set("state", state);
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
    // 弹窗 nonce：回调页通过 postMessage 回传，主窗口校验防伪造
    params.set("popup_nonce", popupNonce);

    const width = options.width || 480;
    const height = options.height || 640;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);

    const popupFeatures = [
      `width=${width}`,
      `height=${height}`,
      `left=${Math.round(left)}`,
      `top=${Math.round(top)}`,
      "resizable=yes",
      "scrollbars=yes",
      "status=yes",
    ].join(",");

    const popup = window.open(
      `${authorizeEndpoint}?${params.toString()}`,
      "nihplod_sso_popup",
      popupFeatures
    );

    if (!popup) {
      removePkceVerifier(this.config.clientId);
      removeOAuthState(this.config.clientId);
      removePkceVerifier(`${this.config.clientId}_popup_nonce`);
      throw new SsoError(
        "popup_blocked",
        "弹窗被浏览器拦截，请允许弹窗后重试"
      );
    }

    // 计算 redirect_uri 的 origin，用于 postMessage 来源校验
    const redirectUriOrigin = new URL(this.config.redirectUri).origin;

    try {
      // 聚焦弹窗
      popup.focus();

      return await new Promise<TokenData>((resolve, reject) => {
        let completed = false;

        const handleMessage = (event: MessageEvent) => {
          if (completed) return;
          // 校验消息来源：必须来自 redirect_uri 对应的子项目 origin（回调页运行位置）
          if (event.origin !== redirectUriOrigin) return;
          if (!event.data || event.data.type !== "nihplod_sso_popup_callback") return;
          if (!event.data.callbackUrl) return;

          // 校验 popup nonce：防止伪造的 postMessage（fail-closed：本地 nonce 缺失同样拒绝）
          const savedNonce = getPkceVerifier(`${this.config.clientId}_popup_nonce`);
          if (!savedNonce || !timingSafeEqualString(event.data.nonce ?? "", savedNonce)) return;
          removePkceVerifier(`${this.config.clientId}_popup_nonce`);

          completed = true;
          cleanup();

          if (popup && !popup.closed) {
            popup.close();
          }

          this.handleCallback(event.data.callbackUrl)
            .then(resolve)
            .catch(reject);
        };

        const pollTimer = setInterval(() => {
          if (popup.closed) {
            if (!completed) {
              completed = true;
              cleanup();
              reject(
                new SsoError(
                  "popup_closed",
                  "登录窗口已关闭"
                )
              );
            }
          }
        }, 500);

        const cleanup = () => {
          clearInterval(pollTimer);
          window.removeEventListener("message", handleMessage);
          removePkceVerifier(`${this.config.clientId}_popup_nonce`);
        };

        window.addEventListener("message", handleMessage);
      });
    } catch (err) {
      removePkceVerifier(this.config.clientId);
      removeOAuthState(this.config.clientId);
      removePkceVerifier(`${this.config.clientId}_popup_nonce`);
      throw err;
    }
  }

  /**
   * 处理 OAuth 回调
   *
   * 解析回调 URL，校验 state 参数，用授权码交换 token。
   * 成功后 token 自动保存到 token 存储（默认 sessionStorage，可通过 setTokenStorage 定制）。
   *
   * @param callbackUrl - 完整的回调 URL（window.location.href）
   * @returns TokenData 或 null
   */
  async handleCallback(
    callbackUrl: string
  ): Promise<TokenData> {
    const url = new URL(callbackUrl);
    const params = url.searchParams;

    // 检查错误（SSO 中心按 OAuth 2.0 规范回传 error 参数）
    const error = params.get("error");
    if (error) {
      // 授权已失败，本次流程的临时数据（state/verifier）不再有用，一并清理避免残留
      removeOAuthState(this.config.clientId);
      removePkceVerifier(this.config.clientId);
      const desc = params.get("error_description") || error;
      throw new SsoError(mapOAuthErrorToSsoCode(error), `授权失败: ${desc}`);
    }

    const code = params.get("code");
    const returnedState = params.get("state");

    if (!code) {
      // 缺 code 的回调无法继续，清理临时数据避免残留
      removeOAuthState(this.config.clientId);
      removePkceVerifier(this.config.clientId);
      throw new SsoError("token_request_failed", "回调 URL 中缺少 authorization code");
    }

    // 校验 state 参数（CSRF 防护，常量时间比较）
    const savedState = getOAuthState(this.config.clientId);
    if (!savedState || !timingSafeEqualString(savedState, returnedState ?? "")) {
      // state 不匹配：state 与 verifier 一并清除，避免残留半套临时数据
      removeOAuthState(this.config.clientId);
      removePkceVerifier(this.config.clientId);
      throw new SsoError(
        "state_mismatch",
        "State 参数不匹配，可能存在 CSRF 攻击"
      );
    }

    // 获取 code_verifier
    const verifier = getPkceVerifier(this.config.clientId);
    if (!verifier) {
      throw new SsoError(
        "pkce_required",
        "code_verifier 不存在（可能已过期或来自其他标签页）"
      );
    }

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
      const serverError = (errData.error as string) || "";
      throw new SsoError(
        mapOAuthErrorToSsoCode(serverError),
        (errData.error_description as string) || `Token 请求失败: HTTP ${res.status}`
      );
    }

    // 先解析响应体，成功后再清除 state 和 verifier：
    // 若 JSON 畸形导致解析抛错，保留 state/verifier 允许用户重试回调
    const data: TokenResponse = await res.json();

    // OIDC：验证 ID Token 签名、基本声明及 at_hash
    if (data.id_token) {
      try {
        await validateIdToken(
          data.id_token,
          data.access_token,
          this.config.ssoBaseUrl,
          this.config.clientId
        );
      } catch (err) {
        // 验证失败：不保存任何 token，防止伪造 ID Token
        removeTokenData(this.config.clientId);
        throw err;
      }
    }

    // 全部校验通过后清除 state 和 verifier（一次性临时数据）。
    // 推迟到验签之后：若 JWKS 暂时不可达导致验签失败，
    // 保留 state/verifier，用户刷新回调页即可重试
    removeOAuthState(this.config.clientId);
    removePkceVerifier(this.config.clientId);

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

    let res: Response | null = null;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 1) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (lastErr || !res) {
      throw new SsoError("network_error", "刷新 Token 网络请求失败", lastErr);
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
        mapOAuthErrorToSsoCode(errorCode, "refresh"),
        (errData.error_description as string) || `刷新 Token 失败: HTTP ${res.status}`
      );
    }

    const data: TokenResponse = await res.json();

    if (data.id_token) {
      try {
        await validateIdToken(
          data.id_token,
          data.access_token,
          this.config.ssoBaseUrl,
          this.config.clientId
        );
      } catch (err) {
        removeTokenData(this.config.clientId);
        throw err;
      }
    }

    const now = Date.now();
    const tokenData: TokenData = {
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      // RFC 6749 §6：刷新响应可省略 refresh_token，此时沿用旧值
      refresh_token: data.refresh_token || current.refresh_token,
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
   * @param redirectToSso - 是否重定向到 SSO 登出页（默认 false）。
   *   为 true 时携带 state 参数（已保存到 sessionStorage），
   *   回跳页面应调用 validateLogoutState() 校验防登出 CSRF。
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
        discovery?.end_session_endpoint || `${this.config.ssoBaseUrl}/api/oauth/end-session`;
      const logoutUrl = new URL(endSessionEndpoint);
      logoutUrl.searchParams.set("client_id", this.config.clientId);
      const postLogoutUri = this.config.postLogoutRedirectUri || this.config.redirectUri;
      if (postLogoutUri) {
        logoutUrl.searchParams.set(
          "post_logout_redirect_uri",
          postLogoutUri
        );
      }
      if (idTokenHint) {
        logoutUrl.searchParams.set("id_token_hint", idTokenHint);
      }
      // 携带 state 防登出 CSRF：回跳时用 validateLogoutState() 校验
      const state = generateState();
      saveLogoutState(state, this.config.clientId);
      logoutUrl.searchParams.set("state", state);
      window.location.href = logoutUrl.toString();
    }
  }

  /**
   * 校验 RP-Initiated Logout 回跳的 state 参数（登出 CSRF 防护）
   *
   * 在 post_logout_redirect_uri 指向的页面加载时调用；
   * 仅在 URL 携带 state 且与 logout(redirectToSso=true) 保存的值一致时返回 true，
   * 校验后清除已保存的 logout state（一次性）。
   *
   * @param url - 当前页面完整 URL（window.location.href）
   *
   * @example
   * ```typescript
   * if (sso.validateLogoutState(window.location.href)) {
   *   // 来自 SSO 登出的可信回跳
   * }
   * ```
   */
  validateLogoutState(url: string): boolean {
    const returnedState = new URL(url).searchParams.get("state");
    if (!returnedState) return false;
    const savedState = getLogoutState(this.config.clientId);
    if (!savedState) return false;
    if (!timingSafeEqualString(savedState, returnedState)) return false;
    // 校验通过：logout state 为一次性临时数据，立即清除
    removeLogoutState(this.config.clientId);
    return true;
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
