/**
 * OAuth Token 端点单元测试
 * POST /api/oauth/token
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// === Mock Prisma（factory 内联，避免 hoisting 引用问题）===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    oAuthAuthorizationCode: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    oAuthSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

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
}));

// === Mock mask-phone ===
vi.mock("@/lib/mask-phone", () => ({
  maskPhone: vi.fn((p: string) => p.slice(0, 3) + "****" + p.slice(-4)),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "../token/route";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";
import { atomicallyRotateRefreshToken } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";

function createRequest(body: Record<string, string>, contentType = "application/json"): Request {
  return new Request("http://localhost/api/oauth/token", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

function validClient() {
  return {
    id: "1", clientId: "test-client", name: "Test",
    redirectUris: ["https://example.com/cb"],
    scopes: ["openid", "phone"],
    isActive: true,
    backchannelLogoutUri: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("POST /api/oauth/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue(null);
  });

  describe("client 认证", () => {
    it("缺少 client_id 或 client_secret 应返回 401", async () => {
      const req = createRequest({ grant_type: "authorization_code" });
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("invalid_client");
    });

    it("client_secret 不匹配应返回 401", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue(null);
      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "bad-client",
        client_secret: "wrong-secret",
      });
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("invalid_client");
    });
  });

  describe("grant_type=authorization_code", () => {
    it("缺少 authorization code 应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue(validClient());
      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
      });
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("授权码已使用或不存在应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue(validClient());
      // consumeAuthorizationCode 返回 null（已使用/不存在）
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0 });

      const req = createRequest({
        grant_type: "authorization_code",
        client_id: "test-client",
        client_secret: "secret",
        code: "used-code",
      });
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("授权码过期应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue(validClient());
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
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
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("client_id 与授权码不匹配应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue({
        ...validClient(),
        clientId: "other-client",
      });
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
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
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("PKCE code_verifier 缺失应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue(validClient());
      (prisma.oAuthAuthorizationCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 1 });
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
        // 缺少 code_verifier
      });
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });
  });

  describe("grant_type=refresh_token", () => {
    it("缺少 refresh_token 应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue(validClient());
      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
      });
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("refresh token 无效应返回 400", async () => {
      vi.mocked(verifyOAuthClientSecret).mockResolvedValue(validClient());
      // verifyRefreshToken 会尝试验证 JWT，mock 返回 null 即无效
      const req = createRequest({
        grant_type: "refresh_token",
        client_id: "test-client",
        client_secret: "secret",
        refresh_token: "invalid-token",
      });
      const res = await POST(req as unknown as Request);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_grant");
    });
  });

  it("不支持的 grant_type 应返回 400", async () => {
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue(validClient());
    const req = createRequest({
      grant_type: "client_credentials",
      client_id: "test-client",
      client_secret: "secret",
    });
    const res = await POST(req as unknown as Request);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unsupported_grant_type");
  });
});
