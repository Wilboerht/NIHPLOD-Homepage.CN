import React, { ReactNode, ComponentType } from 'react';

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
    phone?: string;
    membership_level?: string;
    total_points?: number;
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
 * SSO SDK 错误类型
 */
/** SSO 错误码 */
type SsoErrorCode = "invalid_config" | "state_mismatch" | "pkce_required" | "token_request_failed" | "session_expired" | "no_refresh_token" | "userinfo_failed" | "not_authenticated" | "authorization_code_expired" | "authorization_code_used" | "client_disabled" | "user_denied_authorization" | "account_disabled" | "sso_server_error" | "rate_limited" | "network_error" | "popup_blocked" | "popup_closed" | "id_token_invalid" | "id_token_unsupported_alg" | "id_token_hs256_unsupported" | "id_token_missing_secret" | "id_token_invalid_signature" | "id_token_issuer_mismatch" | "id_token_audience_mismatch" | "id_token_expired" | "id_token_missing_sub" | "id_token_at_hash_mismatch";
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
 * SsoProvider - React Context Provider
 *
 * 包裹子项目根组件，提供全局 SSO 认证状态管理：
 * - 自动管理 token 刷新定时器（过期前 60s 静默刷新）
 * - 监听 storage 事件实现跨 Tab 同步
 * - 提供 useSso() hook
 */

/**
 * 认证状态为三态：
 * - isLoading=true：初始化/刷新中，user 与 error 均可能为 null
 * - error 非 null：加载用户信息失败（如会话已失效），user 为 null
 * - isAuthenticated=true 且 user 非 null：已登录
 */
interface SsoContextValue {
    /** 当前用户信息 */
    user: SsoUser | null;
    /** 是否已认证 */
    isAuthenticated: boolean;
    /** 是否正在加载（初始化/刷新中） */
    isLoading: boolean;
    /** 最近一次加载用户信息失败的错误（成功或登出后为 null） */
    error: SsoError | null;
    /** 发起登录（同页重定向） */
    login: (returnUrl?: string) => Promise<void>;
    /** 弹窗模式登录（保持当前页面状态不丢失） */
    loginPopup: (options?: {
        returnUrl?: string;
        width?: number;
        height?: number;
    }) => Promise<TokenData>;
    /** 登出 */
    logout: (redirectToSso?: boolean) => Promise<void>;
    /** 刷新用户信息 */
    refreshUser: () => Promise<void>;
    /** 获取 access_token（自动刷新过期 token） */
    getAccessToken: () => Promise<string | null>;
    /** SsoClient 实例（高级用法） */
    client: SsoClient;
}
interface SsoProviderProps {
    /** SSO 客户端配置 */
    config: SsoClientConfig;
    /** 子组件 */
    children: ReactNode;
    /**
     * 自动刷新阈值（秒）
     * access_token 过期前多少秒触发静默刷新。
     * 默认 60 秒。
     */
    refreshThreshold?: number;
    /**
     * Token 静默刷新成功后的回调（可选）。
     * 每次刷新成功时以新的 access_token 调用，可用于同步 token 到外部状态；
     * SDK 不会据此自动重试先前失败的 API 请求，重试需由调用方自行实现。
     */
    onTokenRefreshed?: (token: string) => void;
}
declare function SsoProvider({ config, children, refreshThreshold, onTokenRefreshed, }: SsoProviderProps): React.FunctionComponentElement<React.ProviderProps<SsoContextValue | null>>;
/**
 * useSso Hook
 *
 * 在 SsoProvider 内部使用，获取 SSO 认证状态和操作方法。
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAuthenticated, login, logout } = useSso();
 *   if (!isAuthenticated) return <button onClick={() => login()}>登录</button>;
 *   return <div>欢迎, {user?.nickname}</div>;
 * }
 * ```
 */
declare function useSso(): SsoContextValue;

/**
 * RequireAuth / withAuth — 路由保护组件
 *
 * 用法：
 * - <RequireAuth> 包裹需要登录才能访问的路由
 * - withAuth(Component) HOC 包装单个页面组件
 */

interface RequireAuthProps {
    /** 子组件（受保护的内容） */
    children: React.ReactNode;
    /** 未登录时的回退内容（默认显示加载中） */
    fallback?: React.ReactNode;
    /** 是否在检测到未登录时自动发起登录跳转 */
    autoLogin?: boolean;
    /**
     * 是否使用弹窗模式登录（保持当前页面状态不丢失）
     *
     * 仅在 autoLogin=true 时生效。弹窗被拦截时自动回退到同页重定向。
     */
    usePopup?: boolean;
    /**
     * 登录发起失败时的回调（如弹窗被关闭 popup_closed）。
     * 失败后组件会展示重试入口，不会永久停在"请先登录"。
     */
    onError?: (error: unknown) => void;
    /**
     * 自定义登录失败 UI。不传时显示默认的错误提示与"重试"按钮。
     * retry() 会重新发起登录。
     */
    renderLoginError?: (error: unknown, retry: () => void) => React.ReactNode;
}
/**
 * 路由保护组件
 *
 * 未登录时自动触发登录跳转或显示回退内容。
 * 登录发起失败（如弹窗被关闭）时显示重试入口，并通过 onError 上报。
 *
 * @example
 * ```tsx
 * // 弹窗模式：不中断用户当前操作
 * <RequireAuth autoLogin usePopup>
 *   <Dashboard />
 * </RequireAuth>
 * ```
 */
declare function RequireAuth({ children, fallback, autoLogin, usePopup, onError, renderLoginError, }: RequireAuthProps): string | number | bigint | true | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | React.FunctionComponentElement<React.FragmentProps>;
/**
 * 高阶组件：包装页面组件，要求认证后才能访问
 *
 * @example
 * ```tsx
 * function DashboardPage() { return <div>Dashboard</div>; }
 * export default withAuth(DashboardPage);
 * ```
 */
declare function withAuth<P extends object>(Component: ComponentType<P>): ComponentType<P>;

/**
 * CallbackPage — 通用 OAuth 回调页面组件
 *
 * 子项目只需在回调路由渲染此组件即可完成 code → token 交换。
 * 交换成功后默认整页跳转到 returnUrl 或首页；
 * 传入 onSuccess 可跳过默认跳转，由 SPA 路由接管（保持应用状态）。
 *
 * @example
 * ```tsx
 * // 在回调页面路由中：
 * import { CallbackPage } from "@nihplod/sso-sdk/react";
 * export default function AuthCallback() {
 *   return <CallbackPage />;
 * }
 * ```
 *
 * @example SPA 路由接管跳转（不整页刷新）：
 * ```tsx
 * <CallbackPage onSuccess={() => navigate("/dashboard", { replace: true })} />
 * ```
 */

interface CallbackPageProps {
    /**
     * 登录成功回调。传入后跳过默认的整页跳转（window.location.href），
     * 由调用方用 SPA 路由接管跳转，避免丢失应用内状态。
     */
    onSuccess?: (tokenData: TokenData) => void;
    /** 登录失败回调（错误同时会展示在错误页，除非提供了 renderError） */
    onError?: (error: Error) => void;
    /**
     * 自定义错误页渲染。不传时使用默认错误 UI（DefaultCallbackError）。
     */
    renderError?: (error: string) => React.ReactNode;
}
/** 默认错误页 UI（可通过 renderError 完全替换） */
declare function DefaultCallbackError({ error }: {
    error: string;
}): React.DetailedReactHTMLElement<{
    style: {
        display: "flex";
        flexDirection: "column";
        alignItems: "center";
        justifyContent: "center";
        minHeight: string;
        fontFamily: "system-ui, sans-serif";
    };
}, HTMLElement>;
declare function CallbackPage({ onSuccess, onError, renderError }?: CallbackPageProps): React.FunctionComponentElement<React.FragmentProps> | React.FunctionComponentElement<{
    error: string;
}> | React.DetailedReactHTMLElement<{
    style: {
        display: "flex";
        alignItems: "center";
        justifyContent: "center";
        minHeight: string;
        fontFamily: "system-ui, sans-serif";
    };
}, HTMLElement> | null;

export { CallbackPage, type CallbackPageProps, DefaultCallbackError, RequireAuth, SsoProvider, useSso, withAuth };
