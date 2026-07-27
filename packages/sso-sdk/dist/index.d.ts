/**
 * Token 存储抽象层
 *
 * 默认使用 sessionStorage（非 localStorage），防止 XSS 持久化窃取。
 * 支持注入自定义实现（如 React Native AsyncStorage、Node.js 文件存储）。
 */
/** Token 数据 */
interface TokenData {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    id_token?: string;
    /** Token 签发时间（epoch ms），用于计算过期 */
    issued_at: number;
    /** 访问令牌实际过期时间（epoch ms）= issued_at + expires_in * 1000 */
    expires_at: number;
}
/** 存储接口 */
interface TokenStorage {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
}
/**
 * 设置自定义存储实现
 */
declare function setTokenStorage(storage: TokenStorage): void;
/**
 * 获取当前存储实现
 */
declare function getTokenStorage(): TokenStorage;
declare function saveTokenData(data: TokenData): void;
declare function getTokenData(): TokenData | null;
declare function removeTokenData(): void;
declare function savePkceVerifier(clientId: string, verifier: string): void;
declare function getPkceVerifier(clientId: string): string | null;
declare function removePkceVerifier(clientId: string): void;
declare function saveOAuthState(state: string): void;
declare function getOAuthState(): string | null;
declare function removeOAuthState(): void;
declare function saveReturnUrl(url: string): void;
declare function getReturnUrl(): string | null;
declare function removeReturnUrl(): void;
declare function clearAllSsoData(): void;
/**
 * 清理指定 clientId 列表的 PKCE verifier
 *
 * 适用于非浏览器环境或已知 clientId 场景。
 */
declare function clearVerifiersForClients(clientIds: string[]): void;

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

/** SSO 客户端配置 */
interface SsoClientConfig {
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
interface SsoUser {
    sub: string;
    nickname?: string;
    avatar?: string;
    phone?: string;
    membership_level?: string;
    total_points?: number;
}
/** Token 响应 */
interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    id_token?: string;
}
/** OIDC Discovery 文档 */
interface OidcDiscovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    introspection_endpoint: string;
    scopes_supported: string[];
    response_types_supported: string[];
    grant_types_supported: string[];
    code_challenge_methods_supported: string[];
}
declare class SsoClient {
    readonly config: SsoClientConfig;
    private _discovery;
    private _discoveryFetchedAt;
    private _refreshLock;
    /** Discovery 文档缓存 TTL（5 分钟） */
    private static readonly DISCOVERY_TTL_MS;
    /** Discovery fetch 超时（10 秒） */
    private static readonly DISCOVERY_TIMEOUT_MS;
    constructor(config: SsoClientConfig);
    /**
     * 获取 OIDC Discovery 文档（带缓存 + 超时）
     *
     * 缓存 5 分钟，超时 10 秒。
     * 失败时返回 null（上层调用方回退到硬编码默认端点）。
     */
    private _getDiscovery;
    /** 获取 authorize 端点 URL（优先 Discovery，回退默认） */
    private _getAuthorizeEndpoint;
    /** 获取 token 端点 URL（优先 Discovery，回退默认） */
    private _getTokenEndpoint;
    /** 获取 userinfo 端点 URL（优先 Discovery，回退默认） */
    private _getUserinfoEndpoint;
    /**
     * 发起 SSO 登录
     *
     * 生成 PKCE code_verifier/code_challenge 和 state 参数，
     * 构建 authorize URL，通过 302 跳转到 SSO 登录页。
     *
     * @param returnUrl - 登录成功后的返回地址（可选，保存到 sessionStorage）
     */
    login(returnUrl?: string): Promise<void>;
    /**
     * 构建登录 URL（不跳转，返回 URL 字符串）
     *
     * 适用于需要手动处理跳转的场景。
     */
    getLoginUrl(returnUrl?: string): Promise<string>;
    /**
     * 处理 OAuth 回调
     *
     * 解析回调 URL，校验 state 参数，用授权码交换 token。
     * 成功后 token 自动保存到 sessionStorage。
     *
     * @param callbackUrl - 完整的回调 URL（window.location.href）
     * @returns TokenData 或 null
     */
    handleCallback(callbackUrl: string): Promise<TokenData>;
    /**
     * 刷新 Access Token
     *
     * 使用 refresh_token 换取新的 access_token。
     * 采用互斥锁防止并发刷新。
     * 支持 Refresh Token 原子轮换。
     */
    refreshToken(): Promise<TokenData>;
    private _doRefreshToken;
    /**
     * 获取用户信息
     *
     * 若 access_token 已过期则自动刷新后再请求。
     */
    getUserInfo(): Promise<SsoUser>;
    /**
     * 获取当前 access_token
     *
     * 若已过期则自动刷新。用于子项目自行发起 API 请求时获取 Bearer token。
     * 若无 token 返回 null；若刷新失败则抛出错误（与 getUserInfo 行为一致）。
     */
    getAccessToken(): Promise<string | null>;
    /**
     * 检查是否已认证（不发起网络请求）
     *
     * 仅检查本地是否存在未过期的 access_token。
     */
    isAuthenticated(): boolean;
    /**
     * 登出
     *
     * 清除本地所有 token 和临时数据，并尝试撤销服务端 refresh_token。
     * @param redirectToSso - 是否重定向到 SSO 登出页（默认 false）
     */
    logout(redirectToSso?: boolean): Promise<void>;
    /**
     * 获取 OIDC Discovery 文档
     *
     * 用于调试和获取 SSO 中心完整配置。
     * 可能返回 null（当 Discovery 端点不可达且无缓存时）。
     */
    getDiscovery(): Promise<OidcDiscovery | null>;
}

/**
 * PKCE (Proof Key for Code Exchange) 工具函数
 *
 * 实现 RFC 7636 规范：
 * - code_verifier: 43-128 字符的随机字符串
 * - code_challenge: SHA-256(code_verifier) 的 base64url 编码
 *
 * 仅支持 S256 模式，不提供 plain 模式。
 */
/**
 * 生成 code_verifier
 *
 * 生成 43-128 字符之间的安全随机字符串，
 * 使用 `crypto.getRandomValues` 保证密码学安全性。
 *
 * @param length - 长度（默认 64），范围 43-128
 */
declare function generateCodeVerifier(length?: number): string;
/**
 * 计算 code_challenge (S256)
 *
 * 对 code_verifier 进行 SHA-256 哈希，然后进行 base64url 编码。
 *
 * @param codeVerifier - PKCE code_verifier
 */
declare function generateCodeChallenge(codeVerifier: string): Promise<string>;
/**
 * 生成 state 参数
 *
 * 32 字节 hex 随机字符串，用于 CSRF 防护。
 */
declare function generateState(): string;

/**
 * SSO SDK 错误类型
 */
/** SSO 错误码 */
type SsoErrorCode = "invalid_config" | "state_mismatch" | "pkce_required" | "token_request_failed" | "no_refresh_token" | "userinfo_failed" | "not_authenticated" | "sso_server_error" | "network_error";
/** OAuth 2.0 标准错误码 */
type OAuthErrorCode = "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "invalid_scope" | "access_denied" | "server_error" | "rate_limited";
/**
 * SSO SDK 自定义错误
 */
declare class SsoError extends Error {
    readonly code: SsoErrorCode;
    readonly description: string;
    readonly cause?: unknown;
    constructor(code: SsoErrorCode, description: string, cause?: unknown);
}
/**
 * OAuth 2.0 服务端返回的错误
 */
declare class OAuthError extends Error {
    readonly code: OAuthErrorCode;
    readonly description: string;
    readonly uri?: string;
    constructor(code: OAuthErrorCode, description: string, uri?: string);
}

export { OAuthError, type OAuthErrorCode, type OidcDiscovery, SsoClient, type SsoClientConfig, SsoError, type SsoErrorCode, type SsoUser, type TokenData, type TokenResponse, type TokenStorage, clearAllSsoData, clearVerifiersForClients, generateCodeChallenge, generateCodeVerifier, generateState, getOAuthState, getPkceVerifier, getReturnUrl, getTokenData, getTokenStorage, removeOAuthState, removePkceVerifier, removeReturnUrl, removeTokenData, saveOAuthState, savePkceVerifier, saveReturnUrl, saveTokenData, setTokenStorage };
