/**
 * OAuth 2.0 / OIDC 端到端集成测试
 *
 * 完整流程：authorize(approve) -> 提取 code -> token(authorization_code + PKCE) ->
 * userinfo(Bearer access_token) -> revoke(refresh_token) -> revoke(access_token) ->
 * 再次 userinfo 返回 401
 *
 * 关键约束：
 * - JWT 函数真实运行（不 mock @/lib/jwt）
 * - PKCE 真实生成与校验（不 mock @/lib/oauth-code）
 * - 外部依赖（prisma / ratelimit / csrf / sso-audit / logger / oauth-client /
 *   auth-security / mask-phone / token-blacklist / oauth-cors）统一 mock
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";

// ============================================
// 共享 mock 状态
// ============================================
interface FlowCodeCreateData {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  nonce: string | null;
  expiresAt: Date;
}

interface FlowCodeRecord extends FlowCodeCreateData {
  id: string;
  used: boolean;
  createdAt: Date;
}

const mockStore = vi.hoisted(() => ({
  codeRecord: null as FlowCodeRecord | null,
  reset: () => {
    mockStore.codeRecord = null;
  },
}));

// ============================================
// 统一 mock 外部依赖
// ============================================

// === Prisma：内存化授权码记录，使 create/consume 能自�?===
vi.mock("@/lib/prisma", () => {
  const _flowPrismaClient = {
    oAuthAuthorizationCode: {
      create: vi.fn().mockImplementation(async (args: { data: FlowCodeCreateData }) => {
        const record = {
          id: "code-flow-id",
          code: args.data.code,
          clientId: args.data.clientId,
          userId: args.data.userId,
          redirectUri: args.data.redirectUri,
          scopes: args.data.scopes,
          codeChallenge: args.data.codeChallenge,
          codeChallengeMethod: args.data.codeChallengeMethod,
          nonce: args.data.nonce,
          expiresAt: args.data.expiresAt,
          used: false,
          createdAt: new Date(),
        };
        mockStore.codeRecord = record;
        return record;
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockImplementation(async () => mockStore.codeRecord),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "user-flow-1",
        phone: "13800138000",
        nickname: "Flow User",
        avatar: "https://example.com/avatar.png",
        membershipLevel: "VIP",
        totalPoints: 1000,
        status: "ACTIVE",
      }),
    },
    oAuthSession: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      // sid 会话校验：access token 携带 sid 后 verifyOAuthAccessToken 按 sessionId 查库，
      // 模拟一条活跃 session 放行
      findUnique: vi.fn().mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    },
    userConsent: {
      findUnique: vi.fn().mockResolvedValue({
        scopes: ["openid", "phone", "profile"],
        revokedAt: null,
      }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    refreshToken: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(),
    },
    oAuthClient: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  return {
    prisma: {
      ..._flowPrismaClient,
      $transaction: vi.fn((cb: (tx: typeof _flowPrismaClient) => unknown) => cb(_flowPrismaClient)),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    },
  };
});

// === OAuth Client：authorize / token / revoke 均使用同一个合法 client ===
vi.mock("@/lib/oauth-client", () => ({
  getOAuthClientByClientId: vi.fn(),
  verifyOAuthClientSecret: vi.fn(),
}));

// === 限流：默认放行 ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({
    success: true,
    remaining: 99,
    reset: 0,
    limit: 100,
  }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === 审计日志：静默 ===
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
  scheduleSsoEvent: vi.fn(),
}));

// === 日志：静默 ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === CSRF：默认放行 ===
const mockValidateCSRFToken = vi.fn();
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: (...args: unknown[]) => mockValidateCSRFToken(...args),
  csrfForbiddenResponse: () =>
    new Response(JSON.stringify({ error: "csrf_forbidden" }), { status: 403 }),
}));

// === 用户状态检查：默认有效 ===
vi.mock("@/lib/auth", () => ({
  checkUserStatus: vi.fn().mockResolvedValue({ valid: true }),
}));

// === 认证安全：refresh token 保存/轮换/撤销均 mock ===
const mockExtractDeviceInfo = vi.fn();
const mockSaveRefreshToken = vi.fn();
const mockAtomicallyRotateRefreshToken = vi.fn();
const mockRecordLoginAttempt = vi.fn();
const mockRevokeRefreshToken = vi.fn();
vi.mock("@/lib/auth-security", () => ({
  extractDeviceInfo: (...args: unknown[]) => mockExtractDeviceInfo(...args),
  saveRefreshToken: (...args: unknown[]) => mockSaveRefreshToken(...args),
  atomicallyRotateRefreshToken: (...args: unknown[]) => mockAtomicallyRotateRefreshToken(...args),
  recordLoginAttempt: (...args: unknown[]) => mockRecordLoginAttempt(...args),
  revokeRefreshToken: (...args: unknown[]) => mockRevokeRefreshToken(...args),
}));

// === 手机号脱敏：mock ===
vi.mock("@/lib/mask-phone", () => ({
  maskPhone: vi.fn((p: string) => (p.length < 7 ? p : `${p.slice(0, 3)}****${p.slice(-4)}`)),
}));

// === Token 黑名单：保留真实 access_token 撤销/检查能力，仅 mock 用户级黑名单 ===
vi.mock("@/lib/token-blacklist", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/token-blacklist")>("@/lib/token-blacklist");
  return {
    ...actual,
    isTokenBlacklisted: vi.fn().mockResolvedValue(null),
  };
});

// === OAuth CORS：无需真实数据库查询 ===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

// ============================================
// 导入被测路由（必须在所有 vi.mock 之后）
// ============================================
import { GET as authorizeGet, POST as authorizePost } from "@/app/api/oauth/authorize/route";
import { POST as tokenPost } from "@/app/api/oauth/token/route";
import { GET as userinfoGet } from "@/app/api/oauth/userinfo/route";
import { POST as revokePost } from "@/app/api/oauth/revoke/route";

import { getOAuthClientByClientId, verifyOAuthClientSecret } from "@/lib/oauth-client";
import { signUserToken, signRefreshToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

// ============================================
// 辅助函数
// ============================================
function validClient() {
  return {
    id: "1",
    clientId: "test-client",
    name: "Test",
    redirectUris: ["https://example.com/cb"],
    postLogoutRedirectUris: [],
    scopes: ["openid", "phone", "profile"],
    isActive: true,
    isPublic: false,
    backchannelLogoutUri: null,
    codeTtlSeconds: 300,
    accessTokenTtlSeconds: 900,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ============================================
// 测试套件
// ============================================
describe("OAuth 2.0 / OIDC 端到端流程", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.reset();

    mockValidateCSRFToken.mockReturnValue(true);
    mockExtractDeviceInfo.mockReturnValue({
      deviceName: "Test",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });
    mockSaveRefreshToken.mockResolvedValue(undefined);
    mockAtomicallyRotateRefreshToken.mockResolvedValue({ valid: true });
    mockRecordLoginAttempt.mockResolvedValue(undefined);
    mockRevokeRefreshToken.mockResolvedValue(1);

    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
  });

  it("完整授权码流程：authorize -> token -> userinfo -> revoke -> userinfo 401", async () => {
    const userId = "user-flow-1";
    const phone = "13800138000";
    const state = "abcdefghijklmnopqrstuvwx12345678"; // 32 chars，符合 authorize 最小长度
    const { verifier, challenge } = generatePKCE();

    // 1. 使用真实 JWT 签发用户登录 cookie
    const userToken = await signUserToken({ id: userId, phone });

    // 2. GET /api/oauth/authorize — 已登录但未授权该 client → 302 到 consent 页并携带 oauth_id
    // （POST approve 强制要求 oauth_id 做防篡改比对，需先经 GET 让服务端存储原始参数）
    (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const authorizeGetParams = new URLSearchParams({
      response_type: "code",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid phone profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const authorizeGetReq = new NextRequest(
      `http://localhost/api/oauth/authorize?${authorizeGetParams.toString()}`,
      { headers: { Cookie: `__Host-user_token=${userToken}` } }
    );
    const authorizeGetRes = await authorizeGet(authorizeGetReq);
    expect(authorizeGetRes.status).toBe(302);
    const consentUrl = new URL(authorizeGetRes.headers.get("location")!);
    const oauthId = consentUrl.searchParams.get("oauth_id");
    expect(oauthId).toBeTruthy();

    // 3. POST /api/oauth/authorize — 用户 consent 通过
    const authorizeReq = new NextRequest("http://localhost/api/oauth/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `__Host-user_token=${userToken}`,
        "X-CSRF-Token": "csrf-token",
      },
      body: JSON.stringify({
        action: "approve",
        client_id: "test-client",
        redirect_uri: "https://example.com/cb",
        scope: "openid phone profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        oauth_id: oauthId,
      }),
    });
    const authorizeRes = await authorizePost(authorizeReq);
    // OAuth 2.0 规范推荐 302 Found 用于授权重定向
    expect(authorizeRes.status).toBe(302);

    const location = authorizeRes.headers.get("location")!;
    expect(location).toContain("code=");
    expect(location).toContain(`state=${state}`);

    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get("code")!;
    expect(code).toBeTruthy();
    expect(code.length).toBeGreaterThanOrEqual(43); // 32 bytes hex = 64 chars

    // 4. POST /api/oauth/token — authorization_code + PKCE
    const tokenReq = new NextRequest("http://localhost/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "test-secret",
        code,
        redirect_uri: "https://example.com/cb",
        code_verifier: verifier,
      }),
    });
    const tokenRes = await tokenPost(tokenReq);
    expect(tokenRes.status).toBe(200);
    // RFC 6749 §5.1：token 响应不得被缓存
    expect(tokenRes.headers.get("cache-control")).toBe("no-store");
    expect(tokenRes.headers.get("pragma")).toBe("no-cache");

    const tokenBody = await tokenRes.json();
    expect(tokenBody.access_token).toBeTruthy();
    expect(tokenBody.id_token).toBeTruthy();
    expect(tokenBody.refresh_token).toBeTruthy();
    expect(tokenBody.token_type).toBe("Bearer");
    expect(tokenBody.scope).toBe("openid phone profile");

    const { access_token, refresh_token } = tokenBody;

    // 5. GET /api/oauth/userinfo — Bearer access_token
    const userinfoReq = new NextRequest("http://localhost/api/oauth/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    const userinfoRes = await userinfoGet(userinfoReq);
    expect(userinfoRes.status).toBe(200);

    const userinfoBody = await userinfoRes.json();
    expect(userinfoBody.sub).toBe(userId);
    expect(userinfoBody.phone).toBe("138****8000");

    // 6. POST /api/oauth/revoke — 先撤销 refresh_token
    const revokeRefreshReq = new NextRequest("http://localhost/api/oauth/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: refresh_token,
        token_type_hint: "refresh_token",
        client_id: "test-client",
        client_secret: "test-secret",
      }),
    });
    const revokeRefreshRes = await revokePost(revokeRefreshReq);
    expect(revokeRefreshRes.status).toBe(200);
    // RFC 7009 §2.2：撤销响应不得被缓存
    expect(revokeRefreshRes.headers.get("cache-control")).toBe("no-store");
    expect(await revokeRefreshRes.json()).toEqual({});

    // 验证 refresh token 已触发撤销逻辑
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith(userId, refresh_token);

    // refresh token 携带 sid，仅撤销该会话（不波及同 user+client 的其它设备会话）
    expect(prisma.oAuthSession.updateMany).toHaveBeenCalledWith({
      where: { sessionId: expect.any(String), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });

    // 7. 再次调用 revoke 撤销 access_token，使后续 userinfo 返回 401
    // （注：OAuth 2.0 Token Revocation 中撤销 refresh_token 不会自动使 access_token 失效；
    //  这里通过撤销 access_token 验证最终用户会话失效，符合题目“access token 已被撤销”的断言。）
    const revokeAccessReq = new NextRequest("http://localhost/api/oauth/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: access_token,
        token_type_hint: "access_token",
        client_id: "test-client",
        client_secret: "test-secret",
      }),
    });
    const revokeAccessRes = await revokePost(revokeAccessReq);
    expect(revokeAccessRes.status).toBe(200);
    expect(await revokeAccessRes.json()).toEqual({});

    // 8. 再次 GET /api/oauth/userinfo — access_token 已被撤销，返回 401
    const userinfoAgainReq = new NextRequest("http://localhost/api/oauth/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    const userinfoAgainRes = await userinfoGet(userinfoAgainReq);
    expect(userinfoAgainRes.status).toBe(401);

    const userinfoAgainBody = await userinfoAgainRes.json();
    expect(userinfoAgainBody.error).toBe("invalid_token");
  });

  it("revoke：refresh token 携带 sid 时仅撤销该会话；无 sid 的旧 token 回退 user+client 全量撤销", async () => {
    function revokeRequest(token: string) {
      return new NextRequest("http://localhost/api/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          token_type_hint: "refresh_token",
          client_id: "test-client",
          client_secret: "test-secret",
        }),
      });
    }

    // 带 sid：仅撤销该 sessionId 对应的会话
    const withSid = await signRefreshToken({
      id: "user-flow-1",
      phone: "13800138000",
      clientId: "test-client",
      scope: "openid",
      sid: "sess-device-a",
    });
    const res1 = await revokePost(revokeRequest(withSid));
    expect(res1.status).toBe(200);
    expect(prisma.oAuthSession.updateMany).toHaveBeenCalledWith({
      where: { sessionId: "sess-device-a", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.oAuthSession.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-flow-1" }),
      })
    );

    vi.mocked(prisma.oAuthSession.updateMany).mockClear();

    // 无 sid 的旧版 refresh token：回退撤销 user+client 全部 session
    const noSid = await signRefreshToken({
      id: "user-flow-1",
      phone: "13800138000",
      clientId: "test-client",
      scope: "openid",
    });
    const res2 = await revokePost(revokeRequest(noSid));
    expect(res2.status).toBe(200);
    expect(prisma.oAuthSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-flow-1", clientId: "test-client", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
