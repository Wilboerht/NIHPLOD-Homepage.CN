/**
 * sid 会话校验集成测试
 *
 * OAuth access token 携带 sid claim（= OAuthSession.sessionId），
 * verifyOAuthAccessToken 按 sid 查库：session 被撤销 / 过期 / 不存在即验证失败。
 * 本文件使用真实 jwt 实现，验证 userinfo / introspect 在 session 撤销后立即失效，
 * 无需等待 access token TTL 到期。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock Prisma（factory 内联，避免 hoisting 引用问题）===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthSession: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock token-blacklist（本测试聚焦 sid 校验，黑名单一律放行）===
vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: vi.fn().mockResolvedValue(null),
  isAccessTokenRevoked: vi.fn().mockResolvedValue(false),
}));

// === Mock OAuth CORS ===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

// === Mock sso-audit ===
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
  scheduleSsoEvent: vi.fn(),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === Mock oauth-client（introspect 需要 client 认证）===
vi.mock("@/lib/oauth-client", () => ({
  verifyOAuthClientSecret: vi.fn(),
}));

import { GET as userinfoGET } from "../userinfo/route";
import { POST as introspectPOST } from "../introspect/route";
import { signOAuthAccessToken } from "@/lib/jwt";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { prisma } from "@/lib/prisma";

const SID = "sess-revoke-1";
const mockFindSession = prisma.oAuthSession.findUnique as ReturnType<typeof vi.fn>;

function activeSession() {
  return { revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) };
}

async function signSidToken() {
  return signOAuthAccessToken({
    id: "user-1",
    phone: "13800138000",
    clientId: "test-client",
    scope: "openid profile",
    sid: SID,
  });
}

function validClient() {
  return {
    id: "1",
    clientId: "test-client",
    name: "Test",
    redirectUris: ["https://example.com/cb"],
    postLogoutRedirectUris: [],
    scopes: ["openid", "profile"],
    isActive: true,
    isPublic: false,
    backchannelLogoutUri: null,
    webhookUri: null,
    codeTtlSeconds: 300,
    accessTokenTtlSeconds: 900,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("sid 会话校验：session 撤销后 userinfo / introspect 立即失效", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/oauth/userinfo", () => {
    function userinfoRequest(token: string) {
      return new Request("http://localhost/api/oauth/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      }) as unknown as NextRequest;
    }

    it("session 有效时正常返回用户信息", async () => {
      mockFindSession.mockResolvedValue(activeSession());
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        phone: "13800138000",
        nickname: "测试用户",
        avatar: null,
        status: "ACTIVE",
        membershipLevel: null,
        totalPoints: null,
      });

      const token = await signSidToken();
      const res = await userinfoGET(userinfoRequest(token));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sub).toBe("user-1");
      // sid 校验确实查询了对应 session
      expect(mockFindSession).toHaveBeenCalledWith({
        where: { sessionId: SID },
        select: { revokedAt: true, expiresAt: true },
      });
    });

    it("session 被撤销（revokedAt 非空）后立即 401", async () => {
      mockFindSession.mockResolvedValue({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const token = await signSidToken();
      const res = await userinfoGET(userinfoRequest(token));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("invalid_token");
      // 不再查询用户信息
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("session 不存在（fail-closed）后立即 401", async () => {
      mockFindSession.mockResolvedValue(null);

      const token = await signSidToken();
      const res = await userinfoGET(userinfoRequest(token));
      expect(res.status).toBe(401);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("session 已过期后立即 401", async () => {
      mockFindSession.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      const token = await signSidToken();
      const res = await userinfoGET(userinfoRequest(token));
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/oauth/introspect", () => {
    function introspectRequest(token: string) {
      const params = new URLSearchParams({
        token,
        client_id: "test-client",
        client_secret: "secret",
      });
      return new Request("http://localhost/api/oauth/introspect", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }) as unknown as NextRequest;
    }

    it("session 有效时返回 active: true", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({
        client: validClient(),
        reason: "ok",
      });
      mockFindSession.mockResolvedValue(activeSession());

      const token = await signSidToken();
      const res = await introspectPOST(introspectRequest(token));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.active).toBe(true);
      expect(body.sub).toBe("user-1");
    });

    it("session 被撤销后立即返回 active: false", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({
        client: validClient(),
        reason: "ok",
      });
      mockFindSession.mockResolvedValue({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const token = await signSidToken();
      const res = await introspectPOST(introspectRequest(token));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.active).toBe(false);
    });
  });
});
