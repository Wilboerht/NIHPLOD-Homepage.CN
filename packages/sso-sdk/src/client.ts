/**
 * OAuth2Client — NIHPLOD SSO 核心 SDK 类
 *
 * 提供完整的 OAuth 2.0 授权码模式客户端功能：
 * - 生成授权 URL（PKCE S256）
 * - 处理回调（code → token 交换）
 * - Token 自动刷新 + 存储
 * - 获取用户信息
 * - Token Introspection
 * - 单点登出（SLO）
 * - 事件系统 + 降级策略
 *
 * 使用：
 * ```typescript
 * import { OAuth2Client } from "@nihplod/sso-sdk";
 *
 * const sso = new OAuth2Client({
 *   clientId: "advisor",
 *   clientSecret: "your-secret",
 *   redirectUri: "https://advisor.nihplod.cn/callback",
 *   providerUrl: "https://nihplod.cn",
 * });
 *
 * // 生成授权 URL
 * const authUrl = sso.getAuthorizationUrl({ scope: "openid profile phone" });
 *
 * // 处理回调
 * const tokens = await sso.handleCallback({ code, codeVerifier });
 *
 * // 获取用户信息
 * const user = await sso.getUserInfo(tokens.accessToken);
 *
 * // 监听事件
 * sso.on("tokensRefreshed", (data) => console.log("Token refreshed"));
 * sso.on("providerUnavailable", (err) => console.warn("Degraded mode"));
 * ```
 */
import { randomBytes, createHash } from "crypto";
import { SsoEventEmitter } from "./events";
import { DegradationManager } from "./degradation";
import {
  InMemoryTokenStore,
  AutoRefreshManager,
  RefreshMutex,
} from "./token-store";
import type { TokenStore, TokenData } from "./token-store";

// ============================================
// Types
// ============================================

export interface OAuth2ClientConfig {
  /** 子项目 client_id */
  clientId: string;
  /** 子项目 client_secret */
  clientSecret: string;
  /** 子项目回调 URL */
  redirectUri: string;
  /** 主站 URL（如 https://nihplod.cn） */
  providerUrl: string;
  /** 默认请求的 scope（默认 "openid profile"） */
  scope?: string;
  /** Token 存储实现（默认 InMemoryTokenStore） */
  tokenStore?: TokenStore;
  /** Token 自动刷新提前量（毫秒，默认 60 秒） */
  refreshAheadMs?: number;
  /** 降级策略配置 */
  degradation?: {
    failureThreshold?: number;
    cacheTtlMs?: number;
  };
}

export interface AuthorizationUrlParams {
  /** 请求的 scope（空格分隔） */
  scope?: string;
  /** 自定义 state（默认自动生成） */
  state?: string;
}

export interface AuthorizationUrlResult {
  /** 完整授权 URL */
  url: string;
  /** PKCE code_verifier（需保存，用于 handleCallback） */
  codeVerifier: string;
  /** state 参数（需保存，用于 CSRF 校验） */
  state: string;
}

export interface CallbackParams {
  /** 授权码 */
  code: string;
  /** PKCE code_verifier */
  codeVerifier: string;
  /** state 参数（校验 CSRF） */
  state?: string;
  /** 原始 state（校验用） */
  expectedState?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresIn: number;
  scope?: string;
}

export interface UserInfo {
  sub: string;
  phone?: string;
  nickname?: string;
  avatar?: string;
  membershipLevel?: string;
  totalPoints?: number;
}

// ============================================
// PKCE Helpers
// ============================================

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("hex");
}

// ============================================
// OAuth2Client
// ============================================

export class OAuth2Client {
  readonly config: OAuth2ClientConfig;
  readonly events = new SsoEventEmitter();
  readonly degradation: DegradationManager;

  private tokenStore: TokenStore;
  private refreshManager: AutoRefreshManager;
  private refreshMutex = new RefreshMutex();
  private currentTokens: TokenData | null = null;

  constructor(config: OAuth2ClientConfig) {
    this.config = {
      scope: "openid profile",
      ...config,
    };

    this.tokenStore = config.tokenStore ?? new InMemoryTokenStore();
    this.degradation = new DegradationManager({
      failureThreshold: config.degradation?.failureThreshold ?? 3,
      cacheTtlMs: config.degradation?.cacheTtlMs ?? 5 * 60 * 1000,
      onEnterDegraded: () => {
        this.events.emit("providerUnavailable", new Error("主站连续请求失败，进入降级模式"));
      },
      onExitDegraded: () => {
        this.events.emit("providerRecovered");
      },
    });

    this.refreshManager = new AutoRefreshManager({
      refreshAheadMs: config.refreshAheadMs ?? 60_000,
      store: this.tokenStore,
      key: config.clientId,
      refreshFn: (rt) => this.refreshAccessToken(rt),
      onRefreshed: (data) => {
        this.currentTokens = data;
        this.events.emit("tokensRefreshed", {
          accessToken: data.accessToken,
          expiresAt: data.expiresAt,
        });
      },
      onRefreshFailed: (err) => {
        this.degradation.recordFailure();
        this.events.emit("providerUnavailable", err);
      },
    });
  }

  // ==========================================
  // 授权 URL 生成
  // ==========================================

  /**
   * 生成 OAuth 2.0 授权 URL（含 PKCE S256）。
   * 将用户重定向到此 URL 以开始 SSO 登录流程。
   */
  getAuthorizationUrl(params: AuthorizationUrlParams = {}): AuthorizationUrlResult {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = params.state || generateState();

    const url = new URL(`${this.config.providerUrl}/api/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", params.scope || "openid profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return { url: url.toString(), codeVerifier, state };
  }

  // ==========================================
  // 回调处理（code → token）
  // ==========================================

  /**
   * 处理 OAuth 回调：用授权码换取 token。
   * 校验 state 参数防止 CSRF 攻击。
   */
  async handleCallback(params: CallbackParams): Promise<TokenResponse> {
    // CSRF 校验
    if (params.expectedState && params.state !== params.expectedState) {
      throw new Error("State 不匹配，可能存在 CSRF 攻击");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      code_verifier: params.codeVerifier,
    });

    const response = await this.fetchWithDegradation(
      `${this.config.providerUrl}/api/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error_description || `Token 交换失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    const tokenData: TokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 900) * 1000,
      idToken: data.id_token,
      scope: data.scope,
    };

    // 保存 token 并启动自动刷新
    await this.tokenStore.set(this.config.clientId, tokenData);
    this.currentTokens = tokenData;
    this.refreshManager.updateToken(tokenData);

    // 缓存 id_token claims 用于降级
    if (data.id_token) {
      try {
        const parts = data.id_token.split(".");
        if (parts.length === 3) {
          const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
          this.degradation.cacheIdTokenClaims(claims);
        }
      } catch {
        // id_token 解码失败，跳过缓存
      }
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      expiresIn: data.expires_in || 900,
      scope: data.scope,
    };
  }

  // ==========================================
  // Token 刷新
  // ==========================================

  /**
   * 使用 refresh_token 换取新的 token 对。
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenData | null> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await this.fetchWithDegradation(
      `${this.config.providerUrl}/api/oauth/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error_description || `Token 刷新失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    const tokenData: TokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 900) * 1000,
      idToken: data.id_token,
    };

    await this.tokenStore.set(this.config.clientId, tokenData);
    this.currentTokens = tokenData;

    return tokenData;
  }

  // ==========================================
  // 用户信息
  // ==========================================

  /**
   * 获取当前用户信息（按 scope 裁剪）。
   */
  async getUserInfo(accessToken?: string): Promise<UserInfo> {
    const token = accessToken || this.currentTokens?.accessToken;
    if (!token) {
      throw new Error("未提供 access_token");
    }

    const response = await this.fetchWithDegradation(
      `${this.config.providerUrl}/api/oauth/userinfo`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error(`获取用户信息失败: HTTP ${response.status}`);
    }

    return response.json();
  }

  // ==========================================
  // Token Introspection
  // ==========================================

  /**
   * 验证 access_token 有效性（RFC 7662）。
   */
  async introspect(accessToken: string): Promise<{ active: boolean; sub?: string; scope?: string }> {
    const body = new URLSearchParams({
      token: accessToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await this.fetchWithDegradation(
      `${this.config.providerUrl}/api/oauth/introspect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      throw new Error(`Token introspection 失败: HTTP ${response.status}`);
    }

    return response.json();
  }

  // ==========================================
  // 单点登出
  // ==========================================

  /**
   * 执行单点登出：清理本地 token 并通知主站。
   *
   * 注意：通知主站的请求可能因 CSRF 校验失败（SDK 运行在服务端，
   * 无法提供浏览器 CSRF Cookie）。当前仅执行本地 token 清理，
   * 主站 session 由用户浏览器端的登出流程负责撤销。
   * 如需服务端间完整 SLO，建议通过 client_id + client_secret 认证
   * 调用专门的 OAuth 登出端点（待实现）。
   */
  async logout(accessToken?: string): Promise<void> {
    const token = accessToken || this.currentTokens?.accessToken;

    if (token) {
      try {
        await fetch(`${this.config.providerUrl}/api/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        // 登出请求失败不阻塞本地清理
      }
    }

    // 清理本地状态
    await this.tokenStore.delete(this.config.clientId);
    this.currentTokens = null;
    this.refreshManager.stop();
    this.degradation.reset();

    this.events.emit("userLoggedOut", "local");
  }

  // ==========================================
  // 事件监听
  // ==========================================

  /** 监听 SDK 事件 */
  on = this.events.on.bind(this.events);

  /** 单次监听 SDK 事件 */
  once = this.events.once.bind(this.events);

  /** 取消监听 */
  off = this.events.off.bind(this.events);

  // ==========================================
  // 内部方法
  // ==========================================

  /**
   * 带降级策略的 fetch 包装。
   * 请求成功时重置降级计数，失败时累加。
   */
  private async fetchWithDegradation(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status < 500) {
        // 服务端非 5xx 错误（如 400/401）不算 provider 故障
        this.degradation.recordSuccess();
      } else {
        // 5xx 错误可能表示服务不可用
        const enteredDegraded = this.degradation.recordFailure();
        if (enteredDegraded) {
          this.events.emit("providerUnavailable", new Error(`主站返回 ${response.status}`));
        }
      }
      return response;
    } catch (error) {
      const enteredDegraded = this.degradation.recordFailure();
      if (enteredDegraded) {
        this.events.emit(
          "providerUnavailable",
          error instanceof Error ? error : new Error(String(error))
        );
      }
      throw error;
    }
  }

  /** 获取当前缓存的 token */
  get tokens(): TokenData | null {
    return this.currentTokens;
  }

  /** 获取降级模式下的缓存用户信息 */
  get degradedUser(): Record<string, unknown> | null {
    return this.degradation.getCachedClaims();
  }

  /** 初始化：从存储中恢复 token 并启动自动刷新 */
  async init(): Promise<void> {
    const stored = await this.tokenStore.get(this.config.clientId);
    if (stored) {
      this.currentTokens = stored;
      await this.refreshManager.start();
    }
  }
}
