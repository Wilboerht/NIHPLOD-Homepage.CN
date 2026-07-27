import React, { ReactNode, ComponentType } from 'react';

/**
 * Token 存储抽象层
 *
 * 默认使用 sessionStorage（非 localStorage），防止 XSS 持久化窃取。
 * 支持注入自定义实现（如 React Native AsyncStorage、Node.js 文件存储）。
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
 * SsoProvider - React Context Provider
 *
 * 包裹子项目根组件，提供全局 SSO 认证状态管理：
 * - 自动管理 token 刷新定时器（过期前 60s 静默刷新）
 * - 监听 storage 事件实现跨 Tab 同步
 * - 提供 useSso() hook
 */

interface SsoContextValue {
    /** 当前用户信息 */
    user: SsoUser | null;
    /** 是否已认证 */
    isAuthenticated: boolean;
    /** 是否正在加载（初始化/刷新中） */
    isLoading: boolean;
    /** 发起登录 */
    login: (returnUrl?: string) => Promise<void>;
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
     * API 请求函数（可选）
     * 用于在 token 刷新后自动重试失败的 API 请求。
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
}
/**
 * 路由保护组件
 *
 * 未登录时自动触发登录跳转或显示回退内容。
 *
 * @example
 * ```tsx
 * <RequireAuth>
 *   <Dashboard />
 * </RequireAuth>
 * ```
 */
declare function RequireAuth({ children, fallback, autoLogin, }: RequireAuthProps): string | number | bigint | true | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | Promise<string | number | bigint | boolean | React.ReactPortal | React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | null | undefined> | React.FunctionComponentElement<React.FragmentProps>;
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
 * 交换成功后自动跳转到 returnUrl 或首页。
 *
 * @example
 * ```tsx
 * // 在回调页面路由中：
 * import { CallbackPage } from "@nihplod/sso-sdk/react";
 * export default function AuthCallback() {
 *   return <CallbackPage />;
 * }
 * ```
 */

declare function CallbackPage(): React.DetailedReactHTMLElement<{
    style: {
        display: "flex";
        alignItems: "center";
        justifyContent: "center";
        minHeight: string;
        fontFamily: "system-ui, sans-serif";
    };
}, HTMLElement> | null;

export { CallbackPage, RequireAuth, SsoProvider, useSso, withAuth };
