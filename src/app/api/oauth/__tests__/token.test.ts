/**
 * OAuth Token 端点单元测试
 * POST /api/oauth/token
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";

// === Mock Prisma（factory 内联，避免 hoisting 引用问题）===
vi.mock("@/lib/prisma", () => {
  const mockPrismaClient = {
    oAuthAuthorizationCode: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    oAuthClient: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: vi.fn(),
    },
    oAuthSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    userConsent: {
      findUnique: vi.fn(),
    },
    refreshToken: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    prisma: {
      ...mockPrismaClient,
      $transaction: vi.fn((cb: (tx: typeof mockPrismaClient) => unknown) => cb(mockPrismaClient)),
    },
  };
});

// === Mock oauth-client ===
vi.mock("@/lib/oauth-client", () => ({
  verifyOAuthClientSecret: vi.fn(),
}));

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock sso-audit ===
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
  scheduleSsoEvent: vi.fn(),
}));

// === Mock auth-security (refresh token rotation, device info) ===
vi.mock("@/lib/auth-security", () => ({
  atomicallyRotateRefreshToken: vi.fn(),
  extractDeviceInfo: vi.fn().mockReturnValue({
    deviceName: "Test",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  }),
  saveRefreshToken: vi.fn(),
  recordLoginAttempt: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(1),
}));

// === Mock mask-phone ===
vi.mock("@/lib/mask-phone", () => ({
  maskPhone: vi.fn((p: string) => p.slice(0, 3) + "****" + p.slice(-4)),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === Mock oauth-code PKCE ===
vi.mock("@/lib/oauth-code", async () => {
  const actual = await vi.importActual<typeof import("@/lib/oauth-code")>("@/lib/oauth-code");
  return {
    ...actual,
    verifyPKCE: vi.fn().mockReturnValue(true),
  };
});

// === Mock dpop ===
vi.mock("@/lib/dpop", () => ({
  validateDPoPProof: vi.fn(),
  dpopNonceHeader: vi.fn((nonce: string) => ({ "DPoP-Nonce": nonce })),
  getDPoPHtu: vi.fn().mockReturnValue("http://localhost/api/oauth/token"),
  getDpopNonce: vi.fn().mockReturnValue("test-nonce"),
}));

import { POST } from "../token/route";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { rateLimit } from "@/lib/ratelimit";
import { atomicallyRotateRefreshToken, revokeRefreshToken } from "@/lib/auth-security";
import { validateDPoPProof } from "@/lib/dpop";
import { prisma } from "@/lib/prisma";
import { signRefreshToken } from "@/lib/jwt";

function createRequest(body: Record<string, string>, contentType = "application/json"): Request {
  return new Request("http://localhost/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

function validClient() {
  return {
    id: "1",
    clientId: "test-client",
    name: "Test",
    redirectUris: ["https://example.com/cb"],
    postLogoutRedirectUris: [],
    scopes: ["openid", "phone"],
    isActive: true,
    isPublic: false,
    backchannelLogoutUri: null,
    codeTtlSeconds: 300,
    accessTokenTtlSeconds: 900,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("POST /api/oauth/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: null, reason: "not_found" });
  });

  describe("client 认证", () => {
    it("缺少 client_id 或 client_secret 应返回 401", async () => {
      const req = createRequest({ grant_type: "authorization_code" });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("invalid_client");
    });

    it("client_secret 不匹配应返回 401", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: null, reason: "not_found" });
      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "bad-client",
        client_secret: "wrong-secret",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("invalid_client");
    });
  });

  describe("限流（client_id 定向 DoS 防护）", () => {
    it("未认证请求不消耗 client 级限流桶，仅走 IP 桶", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: null, reason: "invalid_secret" });
      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "victim-client",
        client_secret: "wrong-secret",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(401);
      // 只计入 IP 桶；绝不以 client: 前缀消耗受害 client 的全局配额
      expect(rateLimit).toHaveBeenCalledWith("127.0.0.1", "oauth-token");
      const limitKeys = vi.mocked(rateLimit).mock.calls.map((c) => String(c[0]));
      expect(limitKeys.some((k) => k.startsWith("client:"))).toBe(false);
    });

    it("client 认证成功后才计入 client 级限流桶", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      const req = createRequest({
        grant_type: "password", // 不支持的 grant_type，认证通过后尽早退出
        client_id: "test-client",
        client_secret: "secret",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      expect(rateLimit).toHaveBeenCalledWith("127.0.0.1", "oauth-token");
      expect(rateLimit).toHaveBeenCalledWith("client:test-client", "oauth-token");
    });

    it("已认证 client 超出 client 级配额应返回 429", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      // 第一次调用（IP 桶）放行，第二次调用（client 桶）超限
      vi.mocked(rateLimit)
        .mockResolvedValueOnce({ success: true } as Awaited<ReturnType<typeof rateLimit>>)
        .mockResolvedValueOnce({ success: false } as Awaited<ReturnType<typeof rateLimit>>);
      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe("rate_limited");
    });

    it("IP 级限流触发时直接 429，不再执行 client 认证", async () => {
      vi.mocked(rateLimit).mockResolvedValueOnce({
        success: false,
      } as Awaited<ReturnType<typeof rateLimit>>);
      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe("rate_limited");
      expect(verifyOAuthClientSecret).not.toHaveBeenCalled();
    });
  });

  describe("grant_type=authorization_code", () => {
    it("缺少 authorization code 应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("授权码已使用或不存在应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      // consumeAuthorizationCode 返回 null（已使用/不存在）
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 0,
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "used-code",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("授权码重放（已使用）应撤销该 code 签发出的所有 token（RFC 9700 §4.5）", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      // consumeAuthorizationCode 原子消费失败
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 0,
      });
      // findUsedAuthorizationCode 发现 code 存在且已使用 → 判定为重放
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        used: true,
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "replayed-code",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      // 撤销关联的 OAuthSession（通过 authorizationCodeId）
      expect(prisma.oAuthSession.updateMany).toHaveBeenCalledWith({
        where: { authorizationCodeId: "code-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // 撤销该 user+client 的 refresh token（会话族）
      expect(revokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "test-client");
    });

    it("请求体非法 JSON 应返回 400 invalid_request 且响应不可缓存", async () => {
      const req = new Request("http://localhost/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad-json",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("pragma")).toBe("no-cache");
    });

    it("授权码过期应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: null,
        codeChallengeMethod: null,
        expiresAt: new Date(Date.now() - 10000), // 已过期
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "expired-code",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("client_id 与授权码不匹配应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({
        client: {
          ...validClient(),
          clientId: "other-client",
        },
        reason: "ok",
      });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client", // 与请求的 other-client 不匹配
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: null,
        codeChallengeMethod: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "other-client",
        client_secret: "secret",
        code: "code",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("缺少 redirect_uri 应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: "some-challenge",
        codeChallengeMethod: "S256",
        expiresAt: new Date(Date.now() + 60000),
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "code",
        code_verifier: "verifier",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("redirect_uri 与授权请求不一致应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: "some-challenge",
        codeChallengeMethod: "S256",
        expiresAt: new Date(Date.now() + 60000),
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "code",
        redirect_uri: "https://evil.com/cb",
        code_verifier: "verifier",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("PKCE code_verifier 缺失应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: "some-challenge",
        codeChallengeMethod: "S256",
        expiresAt: new Date(Date.now() + 60000),
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "code",
        redirect_uri: "https://example.com/cb",
        // 缺少 code_verifier
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("授权码未携带 PKCE 应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: null,
        codeChallengeMethod: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "code",
        redirect_uri: "https://example.com/cb",
        code_verifier: "verifier",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("PKCE");
    });

    it("签发成功：先创建 OAuthSession，access token 携带其 sessionId 作为 sid claim", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: "some-challenge",
        codeChallengeMethod: "S256",
        expiresAt: new Date(Date.now() + 60000),
        nonce: null,
      });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        membershipLevel: null,
        totalPoints: null,
        status: "ACTIVE",
      });
      (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      // 无已有 session → 新建
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "code",
        redirect_uri: "https://example.com/cb",
        code_verifier: "verifier",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      const body = await res.json();

      // session 在签发 access token 前创建，sid 与 sessionId 一致
      expect(prisma.oAuthSession.create).toHaveBeenCalled();
      const createArg = (prisma.oAuthSession.create as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { data: { sessionId: string } };
      expect(createArg.data.sessionId).toBeTruthy();
      expect(decodeJwt(body.access_token).sid).toBe(createArg.data.sessionId);
    });

    it("授权码已有 session（重试）时复用其 sessionId 作为 sid，不重复创建", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.oAuthAuthorizationCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "code-1",
        clientId: "test-client",
        userId: "user-1",
        redirectUri: "https://example.com/cb",
        scopes: ["openid"],
        code: "hashed-code",
        codeChallenge: "some-challenge",
        codeChallengeMethod: "S256",
        expiresAt: new Date(Date.now() + 60000),
        nonce: null,
      });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        membershipLevel: null,
        totalPoints: null,
        status: "ACTIVE",
      });
      (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "session-row-1",
        sessionId: "sess-existing",
      });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "code",
        redirect_uri: "https://example.com/cb",
        code_verifier: "verifier",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(prisma.oAuthSession.create).not.toHaveBeenCalled();
      expect(decodeJwt(body.access_token).sid).toBe("sess-existing");
    });
  });

  describe("grant_type=refresh_token", () => {
    it("缺少 refresh_token 应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("refresh token 无效应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      // verifyRefreshToken 会尝试验证 JWT，mock 返回 null 即无效
      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
        refresh_token: "invalid-token",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("refresh token 的 client_id 与请求不一致应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      // 签发属于 other-client 的 refresh token
      const refreshToken = await signRefreshToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "other-client",
        scope: "openid",
      });

      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
        refresh_token: refreshToken,
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toContain("client");
    });

    it("refresh token 携带匹配 client_id 时应进入轮换流程", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      // atomicallyRotateRefreshToken 默认返回 undefined，会导致轮换失败；
      // 这里 mock 为成功，验证 client_id 校验通过
      vi.mocked(atomicallyRotateRefreshToken).mockResolvedValue({
        valid: true,
      } as unknown as Awaited<ReturnType<typeof atomicallyRotateRefreshToken>>);
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        scopes: ["openid", "phone"],
      });
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        membershipLevel: null,
        totalPoints: null,
        status: "ACTIVE",
      });

      const refreshToken = await signRefreshToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "test-client",
        scope: "openid phone",
      });

      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
        refresh_token: refreshToken,
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      // RFC 6749 §5.1：token 响应不得被缓存
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("pragma")).toBe("no-cache");
      const body = await res.json();
      expect(body.access_token).toBeDefined();
      expect(body.refresh_token).toBeDefined();
      expect(body.scope).toBe("openid phone");
    });

    it("refresh 签发的新 access token 携带活跃 session 的 sessionId 作为 sid claim", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      vi.mocked(atomicallyRotateRefreshToken).mockResolvedValue({
        valid: true,
      } as unknown as Awaited<ReturnType<typeof atomicallyRotateRefreshToken>>);
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        sessionId: "sess-refresh-1",
        scopes: ["openid", "phone"],
      });
      (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        membershipLevel: null,
        totalPoints: null,
        status: "ACTIVE",
      });

      const refreshToken = await signRefreshToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "test-client",
        scope: "openid phone",
      });

      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
        refresh_token: refreshToken,
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(decodeJwt(body.access_token).sid).toBe("sess-refresh-1");
    });

    it("无活跃 OAuthSession 时应拒绝刷新（fail-closed），不执行轮换", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const refreshToken = await signRefreshToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "test-client",
        scope: "openid",
      });

      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
        refresh_token: refreshToken,
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
      expect(atomicallyRotateRefreshToken).not.toHaveBeenCalled();
    });

    it("refresh token 已绑定 DPoP 时，缺少 DPoP proof 应返回 400 且不执行轮换", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        sessionId: "sess-dpop-1",
        scopes: ["openid"],
      });
      (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const refreshToken = await signRefreshToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "test-client",
        scope: "openid",
        dpopJkt: "jkt-bound",
      });

      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
        refresh_token: refreshToken,
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_dpop_proof");
      expect(validateDPoPProof).not.toHaveBeenCalled();
      expect(atomicallyRotateRefreshToken).not.toHaveBeenCalled();
    });

    it("DPoP proof 的 jkt 与绑定不一致应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        sessionId: "sess-dpop-1",
        scopes: ["openid"],
      });
      (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      vi.mocked(validateDPoPProof).mockResolvedValue({ valid: true, jkt: "jkt-other" });

      const refreshToken = await signRefreshToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "test-client",
        scope: "openid",
        dpopJkt: "jkt-bound",
      });

      const req = new Request("http://localhost/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", DPoP: "proof-jwt" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: "test-client",
          client_secret: "secret",
          refresh_token: refreshToken,
        }),
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_dpop_proof");
      expect(atomicallyRotateRefreshToken).not.toHaveBeenCalled();
    });

    it("DPoP proof 验证通过时，新 access token 携带 cnf.jkt 且新 refresh token 延续绑定", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      vi.mocked(validateDPoPProof).mockResolvedValue({ valid: true, jkt: "jkt-bound" });
      vi.mocked(atomicallyRotateRefreshToken).mockResolvedValue({
        valid: true,
      } as unknown as Awaited<ReturnType<typeof atomicallyRotateRefreshToken>>);
      (prisma.oAuthSession.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        sessionId: "sess-dpop-1",
        scopes: ["openid"],
      });
      (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "user-1",
        phone: "13800138000",
        nickname: null,
        avatar: null,
        membershipLevel: null,
        totalPoints: null,
        status: "ACTIVE",
      });

      const refreshToken = await signRefreshToken({
        id: "user-1",
        phone: "13800138000",
        clientId: "test-client",
        scope: "openid",
        dpopJkt: "jkt-bound",
      });

      const req = new Request("http://localhost/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", DPoP: "proof-jwt" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: "test-client",
          client_secret: "secret",
          refresh_token: refreshToken,
        }),
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      // 签发新的服务端 nonce，供下一次 proof 使用
      expect(res.headers.get("dpop-nonce")).toBe("test-nonce");
      const body = await res.json();
      // cnf.jkt 延续到新 access token
      expect((decodeJwt(body.access_token).cnf as { jkt?: string }).jkt).toBe("jkt-bound");
      // 绑定延续到新 refresh token（下一次刷新仍要求 DPoP proof）
      expect(decodeJwt(body.refresh_token).dpop_jkt).toBe("jkt-bound");
    });
  });

  describe("grant_type=client_credentials", () => {
    it("M2M token 无 session，不携带 sid claim", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
      const req = createRequest({
        grant_type: "client_credentials",
        client_id: "test-client",
        client_secret: "secret",
        scope: "openid",
      });
      const res = await POST(req as unknown as NextRequest);
      expect(res.status).toBe(200);
      const body = await res.json();
      const payload = decodeJwt(body.access_token);
      expect(payload.client_type).toBe("m2m");
      expect(payload.sid).toBeUndefined();
      expect(prisma.oAuthSession.findFirst).not.toHaveBeenCalled();
    });
  });

  it("不支持的 grant_type 应返回 400", async () => {
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue({ client: validClient(), reason: "ok" });
    const req = createRequest({
      grant_type: "password",
      client_id: "test-client",
      client_secret: "secret",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unsupported_grant_type");
  });
});
