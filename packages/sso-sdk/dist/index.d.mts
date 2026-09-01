/**
 * Token 存储抽象层
 *
 * 分两类存储：
 * - Token 数据：默认使用 sessionStorage（标签页级持久化）。登录回调后 CallbackPage
 *   默认整页跳转，内存存储会丢失登录态，因此默认改为 sessionStorage：
 *   整页跳转与刷新后登录态保留，关闭标签页自动清除；SSR / 隐私模式写入失败时
 *   降级为内存 Map。对需要多 Tab 共享 token 或 BFF/Confidential Client 场景，
 *   可通过 setTokenStorage() 注入 localStorage 实现（如 createSecureStorage({ persist: true })）。
 * - 临时数据（PKCE verifier / state / returnUrl / popup nonce）：必须跨整页重定向存活
 *   （login() 会 302 跳转到 SSO 中心再回来），因此默认写入 sessionStorage；
 *   SSR 等无 sessionStorage 环境自动降级为内存 Map。
 *
 * 多 client 隔离：
 * - token / state / return_url 均支持按 clientId 隔离 key
 * - 不传 clientId 时使用全局 key，保持向后兼容
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
 * 创建存储实现
 *
 * @param options.persist 是否持久化到 localStorage。默认 false（sessionStorage）。
 *   - false（默认）：sessionStorage，标签页级持久化（刷新/整页跳转后登录态保留，
 *     关闭标签页即清除），多 Tab 间不共享；隐私模式等写入失败时降级为内存。
 *   - true：localStorage，多 Tab 共享、关闭浏览器后仍保留。
 *   ⚠️ 安全警告：persist=true 会将 refresh_token 明文写入 localStorage，
 *   任何 XSS 均可在不被检测的情况下读取。仅在 BFF/Confidential Client
 *   且 refresh_token 不直接暴露给浏览器的场景下使用。
 */
declare function createSecureStorage(options?: {
    persist?: boolean;
}): TokenStorage;
/**
 * 设置自定义存储实现
 */
declare function setTokenStorage(storage: TokenStorage): void;
/**
 * 获取当前存储实现
 */
declare function getTokenStorage(): TokenStorage;
declare function saveTokenData(data: TokenData, clientId?: string): void;
declare function getTokenData(clientId?: string): TokenData | null;
declare function removeTokenData(clientId?: string): void;
declare function savePkceVerifier(clientId: string, verifier: string): void;
declare function getPkceVerifier(clientId: string): string | null;
declare function removePkceVerifier(clientId: string): void;
declare function saveOAuthState(state: string, clientId?: string): void;
declare function getOAuthState(clientId?: string): string | null;
declare function removeOAuthState(clientId?: string): void;
declare function saveLogoutState(state: string, clientId?: string): void;
declare function getLogoutState(clientId?: string): string | null;
declare function removeLogoutState(clientId?: string): void;
declare function saveReturnUrl(url: string, clientId?: string): void;
declare function getReturnUrl(clientId?: string): string | null;
declare function removeReturnUrl(clientId?: string): void;
declare function clearAllSsoData(clientId?: string): void;
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
    /** RP-Initiated Logout 返回地址（可选）。不传时回退到 redirectUri */
    postLogoutRedirectUri?: string;
}
/** 用户信息 */
interface SsoUser {
    sub: string;
    nickname?: string;
    avatar?: string;
    /** 手机号（脱敏，兼容保留的非标准 claim，新代码请使用 phone_number） */
    phone?: string;
    /** 手机号（脱敏，OIDC 标准 claim，与 phone 内容一致） */
    phone_number?: string;
    /** 生日（ISO 8601，需 birthday scope，未设置时为 null） */
    birthday?: string | null;
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
    revocation_endpoint?: string;
    end_session_endpoint?: string;
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
     * 开放重定向防护：仅保存相对路径或与当前页面同源的 returnUrl，
     * 其余（如 https://evil.com）忽略并告警，防止回调后跳转到钓鱼站点。
     */
    private _saveReturnUrlIfTrusted;
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
    login(returnUrl?: string): Promise<void>;
    /**
     * 构建登录 URL（不跳转，返回 URL 字符串）
     *
     * 适用于需要手动处理跳转的场景。
     *
     * ⚠️ 不要与 login() 混用：两者都会重新生成并覆盖 sessionStorage 中的
     * state / PKCE verifier，先调用的那次授权流程将因 state 不匹配而失败。
     * 同一次登录只使用其中一个入口。
     */
    getLoginUrl(returnUrl?: string): Promise<string>;
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
    loginPopup(options?: {
        returnUrl?: string;
        width?: number;
        height?: number;
    }): Promise<TokenData>;
    /**
     * 处理 OAuth 回调
     *
     * 解析回调 URL，校验 state 参数，用授权码交换 token。
     * 成功后 token 自动保存到 token 存储（默认 sessionStorage，可通过 setTokenStorage 定制）。
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
     * @param redirectToSso - 是否重定向到 SSO 登出页（默认 false）。
     *   为 true 时携带 state 参数（已保存到 sessionStorage），
     *   回跳页面应调用 validateLogoutState() 校验防登出 CSRF。
     */
    logout(redirectToSso?: boolean): Promise<void>;
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
    validateLogoutState(url: string): boolean;
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
type SsoErrorCode = "invalid_config" | "state_mismatch" | "pkce_required" | "token_request_failed" | "session_expired" | "no_refresh_token" | "userinfo_failed" | "not_authenticated" | "authorization_code_expired" | "authorization_code_used" | "client_disabled" | "user_denied_authorization" | "account_disabled" | "sso_server_error" | "rate_limited" | "network_error" | "popup_blocked" | "popup_closed" | "id_token_invalid" | "id_token_unsupported_alg" | "id_token_hs256_unsupported" | "id_token_missing_secret" | "id_token_invalid_signature" | "id_token_issuer_mismatch" | "id_token_audience_mismatch" | "id_token_expired" | "id_token_missing_sub" | "id_token_at_hash_mismatch";
/**
 * 将 OAuth 2.0 服务端 error 字段映射到 SsoErrorCode
 *
 * @param oauthError 服务端返回的 error 字段
 * @param context 调用上下文："token_exchange"（授权码换 token）或 "refresh"（刷新）。
 *   invalid_grant 在换 token 场景多为授权码过期/已用，在刷新场景多为会话失效，
 *   需按上下文细化映射。
 */
declare function mapOAuthErrorToSsoCode(oauthError: string, context?: "token_exchange" | "refresh"): SsoErrorCode;
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
 * OAuth 2.0 协议层错误（RFC 6749 §5.2）
 *
 * 保留用于表示服务端原样返回的 OAuth 错误（error / error_description / error_uri），
 * 与 SDK 语义的 SsoError 区分。当前 SDK 内部不抛出此类型（统一使用 SsoError +
 * mapOAuthErrorToSsoCode 映射），作为公共类型导出供子项目自行解析 OAuth 响应时使用。
 */
declare class OAuthError extends Error {
    readonly code: string;
    readonly description: string;
    readonly uri?: string;
    constructor(code: string, description: string, uri?: string);
}

/**
 * 安全相关小工具：returnUrl 开放重定向校验、常量时间字符串比较
 */
/**
 * 校验 returnUrl 是否可信（防开放重定向）。
 * 仅允许：相对路径（且不以 // 开头）或与 currentOrigin 完全同源的绝对 URL。
 * 拒绝一切含反斜杠 \ 的值：浏览器会把 "/\evil.com" 归一化为 "//evil.com"，
 * 形成协议相对 URL 开放重定向。
 */
declare function isTrustedReturnUrl(url: string, currentOrigin: string): boolean;
/**
 * 常量时间字符串比较（避免 state / at_hash / nonce 等机密值的时序侧信道）。
 * 长度不同也执行完整循环，不提前返回。
 */
declare function timingSafeEqualString(a: string, b: string): boolean;

export { OAuthError, type OidcDiscovery, SsoClient, type SsoClientConfig, SsoError, type SsoErrorCode, type SsoUser, type TokenData, type TokenResponse, type TokenStorage, clearAllSsoData, clearVerifiersForClients, createSecureStorage, generateCodeChallenge, generateCodeVerifier, generateState, getLogoutState, getOAuthState, getPkceVerifier, getReturnUrl, getTokenData, getTokenStorage, isTrustedReturnUrl, mapOAuthErrorToSsoCode, removeLogoutState, removeOAuthState, removePkceVerifier, removeReturnUrl, removeTokenData, saveLogoutState, saveOAuthState, savePkceVerifier, saveReturnUrl, saveTokenData, setTokenStorage, timingSafeEqualString };
