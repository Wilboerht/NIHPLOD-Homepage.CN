import { JWTPayload } from 'jose';

/**
 * @nihplod/sso-verify
 *
 * NIHPLOD 一网通 SSO Token 验证工具包
 *
 * 供子项目在后端验证主站签发的 Access Token。
 *
 * 由于主站当前使用 HS256 对称签名，JWKS 端点不公开签名密钥，
 * 因此本工具包默认采用 OAuth 2.0 Token Introspection（RFC 7662）
 * 端点进行验证。对于已知共享密钥的内部服务，也可传入
 * accessTokenSecret 做本地 JWT 验证。
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
     * 推荐优先使用，适配当前 HS256 对称签名场景。
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
}
interface VerifiedTokenPayload extends JWTPayload {
    sub: string;
    aud: string;
    iss: string;
    client_id?: string;
    scope?: string;
    phone?: string;
}
interface IntrospectResponse {
    active: boolean;
    sub?: string;
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
     * 1. 若配置了 accessTokenSecret，先尝试本地 JWT 验证
     * 2. 否则/失败后，调用 Introspection 端点
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
};
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
declare function ssoMiddleware(options: SsoVerifierOptions): (req: any, res: any, next: () => void) => Promise<void>;

export { type SsoVerifierOptions, type VerifiedTokenPayload, createTokenVerifier, ssoMiddleware };
