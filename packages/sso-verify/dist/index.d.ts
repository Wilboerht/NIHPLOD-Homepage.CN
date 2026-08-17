import { JWTPayload } from 'jose';

/**
 * @nihplod/sso-verify
 *
 * NIHPLOD 一网通 SSO Token 验证工具包
 *
 * 供子项目在后端验证主站签发的 Access Token。
 *
 * 由于主站 access_token 的签名算法取决于部署配置（配置 JWT_ACCESS_PRIVATE_KEY
 * 后以 RS256 签名，未配置时回退 HS256 对称签名），JWKS 端点仅在 RS256
 * 模式下公开公钥，因此本工具包默认采用 OAuth 2.0 Token Introspection
 * （RFC 7662）端点进行验证。对于已知共享密钥/公钥的内部服务，也可传入
 * accessTokenSecret（HS256）或 accessTokenPublicKey / jwksUri（RS256）做本地 JWT 验证。
 *
 * 安装：npm install @nihplod/sso-verify
 *
 * 使用：
 * ```typescript
 * import { createTokenVerifier } from "@nihplod/sso-verify";
 * const verifier = createTokenVerifier({
 *   introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
 *   clientId: "advisor",
 *   clientSecret: "YOUR_CLIENT_SECRET",
 *   audience: "advisor",
 * });
 *
 * const payload = await verifier.verify(token);
 * if (payload) {
 *   console.log(payload.sub); // 用户 ID
 * }
 * ```
 */

interface SsoVerifierOptions {
    /** 期望的 audience（对应子项目的 client_id） */
    audience: string;
    /** 期望的 issuer（主站 URL），默认 "https://nihplod.cn" */
    issuer?: string;
    /**
     * Token Introspection 端点 URL。
     * 推荐优先使用，与主站签名算法（HS256/RS256）无关，且能实时感知撤销。
     */
    introspectionEndpoint?: string;
    /** 子项目的 client_id（用于 introspection） */
    clientId?: string;
    /** 子项目的 client_secret（用于 introspection） */
    clientSecret?: string;
    /**
     * 共享的 Access Token Secret（可选）。
     * 仅在子项目与主站共享 JWT_ACCESS_SECRET 时使用本地验证。
     * 注意：当前 JWKS 端点不公开对称密钥，因此不能通过 JWKS 获取此值。
     */
    accessTokenSecret?: string;
    /** Introspection 结果缓存 TTL（毫秒），默认 30 秒 */
    introspectCacheTtl?: number;
    /**
     * Introspection 请求超时时间（毫秒），默认 10 秒。
     * 超时按验证失败处理（返回 null）。
     */
    introspectTimeoutMs?: number;
    /**
     * Introspection 返回 active:false（已撤销/无效）结果的缓存 TTL（毫秒），默认 5 秒。
     * 明显短于 active:true 的 TTL，以降低 token 撤销后的生效延迟。
     * 设为 0 表示不缓存 active:false 结果。
     */
    introspectNegativeCacheTtl?: number;
    /**
     * Access Token RS256 公钥（PEM 格式，可选）。
     * 主站在配置 JWT_ACCESS_PRIVATE_KEY 后以 RS256 签名 access_token，
     * 子项目可传入此公钥进行本地验证，避免每次都调用 Introspection 端点。
     * 若主站未配置 RS256 密钥（回退 HS256 签名），此选项不生效。
     */
    accessTokenPublicKey?: string;
    /**
     * JWKS 端点 URL（可选）。
     * 子项目可传入此 URL 以动态获取 RS256 公钥进行本地验证。
     * 当 accessTokenPublicKey 未配置时，将通过此端点获取匹配 kid 的公钥。
     */
    jwksUri?: string;
    /**
     * Logout Token Secret（可选）。
     * 用于本地验证主站签发的 logout_token（HS256 签名）。
     * 若未提供，将回退使用 accessTokenSecret 进行验证。
     */
    logoutTokenSecret?: string;
    /**
     * Logout Token RS256 公钥（PEM 格式，可选）。
     * 主站 logout_token 使用独立密钥对（kid: logout-token-rs256-v1）签名，
     * 与 access token 密钥不同，因此不能使用 accessTokenPublicKey 验证。
     * 若未提供但配置了 jwksUri，将通过 JWKS 按 kid 匹配获取对应公钥。
     * RS256 签名的 logout_token 在无任何可用公钥时验证失败（返回 null），
     * 不会静默回退到 HS256。
     */
    logoutTokenPublicKey?: string;
    /**
     * Introspection 请求失败重试次数，默认 1。
     * 仅对网络错误与 5xx 响应重试（短退避），4xx 不重试。
     * 设为 0 表示不重试。
     */
    introspectRetries?: number;
    /**
     * JWT 时钟偏移容忍（秒），默认 60。
     * 应用于所有本地验签路径（HS256/RS256/logout token），
     * 用于容忍子项目与主站之间的时钟偏差。
     */
    clockToleranceSeconds?: number;
    /**
     * Logout Token jti 外部存储（可选）。
     * 默认使用进程内 LRU 缓存（重启即清空、多实例不共享）；
     * 多实例部署时应注入共享存储（如 Redis 实现）以防跨实例重放。
     */
    logoutJtiStore?: LogoutJtiStore;
}
/**
 * Logout Token jti 防重放存储接口（可注入 Redis 等共享存储实现）。
 * has/add 均支持同步或异步返回。
 */
interface LogoutJtiStore {
    /** 判断 jti 是否已处理过 */
    has(key: string): boolean | Promise<boolean>;
    /** 记录已处理的 jti，ttlSeconds 后过期 */
    add(key: string, ttlSeconds: number): void | Promise<void>;
}
interface VerifiedTokenPayload extends JWTPayload {
    sub: string;
    aud: string;
    iss: string;
    client_id?: string;
    scope?: string;
    phone?: string;
}
/**
 * Logout Token Payload（RFC 7519 + OIDC Back-Channel Logout 1.0）
 *
 * 主站签发 logout_token 时包含以下字段：
 * - iss: 主站 issuer
 * - aud: 目标 client_id
 * - sub: 用户 ID
 * - iat: 签发时间
 * - jti: 唯一 ID（防重放，建议接收方缓存已处理的 jti）
 * - events: { "http://schemas.openid.net/event/backchannel-logout": {} }
 */
interface LogoutTokenPayload {
    /** JWT type，logout_token 固定值为 "logout_token" */
    type: "logout_token";
    /** 签发者 */
    iss: string;
    /** 目标 audience */
    aud: string;
    /** 用户 ID */
    sub: string;
    /** 签发时间（UNIX timestamp） */
    iat: number;
    /** JWT ID（唯一标识，防重放） */
    jti: string;
    /** Backchannel logout 事件声明 */
    events: {
        "http://schemas.openid.net/event/backchannel-logout": Record<string, never>;
    };
    /** sid (Session ID)，可选 */
    sid?: string;
}
interface IntrospectResponse {
    active: boolean;
    sub?: string;
    aud?: string | string[];
    client_id?: string;
    scope?: string;
    exp?: number;
    [key: string]: unknown;
}
declare function createTokenVerifier(options: SsoVerifierOptions): {
    /**
     * 验证 Access Token
     *
     * 验证顺序：
     * 1. 若配置了 accessTokenSecret，先尝试 HS256 本地验证
     * 2. 若配置了 accessTokenPublicKey 或 jwksUri，尝试 RS256 本地验证
     * 3. 若上述均失败/未配置，调用 Introspection 端点
     *
     * @returns token payload 或者 null（验证失败）
     */
    verify(token: string): Promise<VerifiedTokenPayload | null>;
    /**
     * 直接调用 Introspection 端点
     */
    introspect: (token: string) => Promise<IntrospectResponse | null>;
    /**
     * 清除指定 token 的 Introspection 缓存
     */
    invalidateCache(token: string): void;
    /**
     * 验证 Logout Token（Back-Channel Logout）
     *
     * 用于子项目接收主站 backchannel logout 通知时验证 logout_token。
     * 验证要求（OIDC Back-Channel Logout 1.0）：
     * 1. type === "logout_token"
     * 2. iss 匹配配置的 issuer
     * 3. aud 包含当前 client_id
     * 4. exp 存在（规范要求）
     * 5. events 包含 backchannel-logout 事件，且事件值为对象
     *
     * @returns LogoutTokenPayload 或 null（验证失败）
     */
    verifyLogoutToken(token: string): Promise<LogoutTokenPayload | null>;
};
/** 框架无关的最小中间件请求类型（兼容 Express/Connect 风格） */
interface SsoMiddlewareRequest {
    headers?: Record<string, string | undefined>;
    /** 验证通过后由中间件挂载的用户信息 */
    user?: VerifiedTokenPayload;
    [key: string]: unknown;
}
/** 框架无关的最小中间件响应类型 */
interface SsoMiddlewareResponse {
    status?: (code: number) => {
        json: (body: unknown) => unknown;
    };
    [key: string]: unknown;
}
/**
 * Express/Next.js 兼容中间件
 *
 * 使用示例（Express）:
 * ```typescript
 * app.use(ssoMiddleware({
 *   introspectionEndpoint: "https://nihplod.cn/api/oauth/introspect",
 *   clientId: "advisor",
 *   clientSecret: "SECRET",
 *   audience: "advisor",
 * }));
 * ```
 *
 * 使用示例（Next.js Route Handler）:
 * ```typescript
 * const verifier = createTokenVerifier({ ... });
 * export async function GET(request: NextRequest) {
 *   const token = request.headers.get("authorization")?.replace("Bearer ", "");
 *   const payload = token ? await verifier.verify(token) : null;
 *   if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   // ...
 * }
 * ```
 */
declare function ssoMiddleware(options: SsoVerifierOptions): (req: SsoMiddlewareRequest, res: SsoMiddlewareResponse, next: (err?: unknown) => void) => Promise<void>;
/**
 * 创建 Logout Token 专用验证器
 *
 * 适用于仅需处理 backchannel logout 的子项目。
 * 内部调用 createTokenVerifier 并暴露 verifyLogoutToken 方法。
 *
 * 使用示例：
 * ```typescript
 * import { createLogoutTokenVerifier } from "@nihplod/sso-verify";
 *
 * const logoutVerifier = createLogoutTokenVerifier({
 *   audience: "advisor",
 *   issuer: "https://nihplod.cn",
 *   logoutTokenSecret: process.env.LOGOUT_TOKEN_SECRET,
 * });
 *
 * // 在 backchannel logout 端点中：
 * app.post("/api/auth/backchannel-logout", async (req, res) => {
 *   const token = req.body.logout_token;
 *   const payload = await logoutVerifier.verify(token);
 *   if (payload) {
 *     await clearUserSession(payload.sub);
 *     res.status(200).end();
 *   } else {
 *     res.status(400).end();
 *   }
 * });
 * ```
 */
declare function createLogoutTokenVerifier(options: SsoVerifierOptions): {
    /**
     * 验证 logout_token
     */
    verify(token: string): Promise<LogoutTokenPayload | null>;
};

export { type LogoutJtiStore, type LogoutTokenPayload, type SsoMiddlewareRequest, type SsoMiddlewareResponse, type SsoVerifierOptions, type VerifiedTokenPayload, createLogoutTokenVerifier, createTokenVerifier, ssoMiddleware };
