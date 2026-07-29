/**
 * OAuth Introspect 端点单元测试
 * POST /api/oauth/introspect (RFC 7662)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock oauth-client ===
vi.mock("@/lib/oauth-client", () => ({
  verifyOAuthClientSecret: vi.fn(),
}));

// === Mock jwt ===
const mockVerifyOAuthAccessToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyOAuthAccessToken: (...args: unknown[]) => mockVerifyOAuthAccessToken(...args),
}));

// === Mock sso-audit ===
vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === Mock OAuth CORS（避免测试依赖真实数据库查询 redirectUris）===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

import { POST } from "../introspect/route";
import { verifyOAuthClientSecret } from "@/lib/oauth-client";

function createFormBody(data: Record<string, string>): Request {
  const params = new URLSearchParams(data);
  return new Request("http://localhost/api/oauth/introspect", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

describe("POST /api/oauth/introspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("缺少 client_id 应返回 401", async () => {
    const req = createFormBody({ token: "some-token" });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it("client 认证失败应返回 401", async () => {
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue(null);
    const req = createFormBody({
      token: "some-token",
      client_id: "bad-client",
      client_secret: "wrong",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_client");
  });

  it("token 无效应返回 active: false", async () => {
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue({
      id: "1", clientId: "test-client", name: "Test",
      redirectUris: ["https://example.com/cb"],
      postLogoutRedirectUris: [],
      scopes: ["openid"], isActive: true,
      backchannelLogoutUri: null, createdAt: new Date(), updatedAt: new Date(),
      isPublic: false,
    });
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    const req = createFormBody({
      token: "invalid-token",
      client_id: "test-client",
      client_secret: "secret",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
  });

  it("audience 不匹配应返回 active: false", async () => {
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue({
      id: "1", clientId: "test-client", name: "Test",
      redirectUris: ["https://example.com/cb"],
      postLogoutRedirectUris: [],
      scopes: ["openid"], isActive: true,
      backchannelLogoutUri: null, createdAt: new Date(), updatedAt: new Date(),
      isPublic: false,
    });
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "other-client",
      scope: "openid profile",
      exp: Math.floor(Date.now() / 1000) + 900,
    } as unknown as Awaited<ReturnType<typeof import("@/lib/jwt").verifyOAuthAccessToken>>);
    const req = createFormBody({
      token: "valid-token-for-other-client",
      client_id: "test-client",
      client_secret: "secret",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
  });

  it("token 有效且 audience 匹配应返回完整 introspection", async () => {
    vi.mocked(verifyOAuthClientSecret).mockResolvedValue({
      id: "1", clientId: "test-client", name: "Test",
      redirectUris: ["https://example.com/cb"],
      postLogoutRedirectUris: [],
      scopes: ["openid"], isActive: true,
      backchannelLogoutUri: null, createdAt: new Date(), updatedAt: new Date(),
      isPublic: false,
    });
    const now = Math.floor(Date.now() / 1000);
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid profile",
      exp: now + 900,
      iat: now,
    } as unknown as Awaited<ReturnType<typeof import("@/lib/jwt").verifyOAuthAccessToken>>);
    const req = createFormBody({
      token: "valid-token",
      client_id: "test-client",
      client_secret: "secret",
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(true);
    expect(body.token_type).toBe("Bearer");
    expect(body.client_id).toBe("test-client");
    expect(body.scope).toBe("openid profile");
  });
});
