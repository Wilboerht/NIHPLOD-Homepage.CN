/**
 * OAuth Authorize 端点单元测试
 * GET /api/oauth/authorize  — 参数校验
 * POST /api/oauth/authorize — 用户 consent
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// === Mock oauth-client ===
vi.mock("@/lib/oauth-client", () => ({
  getOAuthClientByClientId: vi.fn(),
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

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === Mock CSRF (simple, non-hoisted-safe) ===
const mockValidateCSRFToken = vi.fn();
const mockCsrfForbiddenResponse = vi.fn();
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: (...args: unknown[]) => mockValidateCSRFToken(...args),
  csrfForbiddenResponse: () => mockCsrfForbiddenResponse(),
}));

import { GET, POST } from "../authorize/route";
import { getOAuthClientByClientId } from "@/lib/oauth-client";
import { NextRequest } from "next/server";

function validClient() {
  return {
    id: "1", clientId: "test-client", name: "Test App",
    redirectUris: ["https://example.com/cb"],
    scopes: ["openid", "phone", "profile"],
    isActive: true,
    backchannelLogoutUri: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("GET /api/oauth/authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("缺少 response_type 应返回 400", async () => {
    const req = new NextRequest("http://localhost/api/oauth/authorize?client_id=test&redirect_uri=https://example.com/cb&scope=openid");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("response_type 不为 code 应返回 400", async () => {
    const req = new NextRequest("http://localhost/api/oauth/authorize?response_type=token&client_id=test&redirect_uri=https://example.com/cb&scope=openid");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("client 不存在应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/oauth/authorize?response_type=code&client_id=nonexistent&redirect_uri=https://example.com/cb&scope=openid");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unauthorized_client");
  });

  it("redirect_uri 不在允许列表应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest("http://localhost/api/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=https://evil.com/cb&scope=openid");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("scope 不在允许列表应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue({
      ...validClient(),
      scopes: ["openid"],
    });
    const req = new NextRequest("http://localhost/api/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=https://example.com/cb&scope=openid%20admin");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_scope");
  });

  it("PKCE method 不为 S256 应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest("http://localhost/api/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=https://example.com/cb&scope=openid&code_challenge=abc&code_challenge_method=plain");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });
});

describe("POST /api/oauth/authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 CSRF 通过
    mockValidateCSRFToken.mockReturnValue(true);
    mockCsrfForbiddenResponse.mockReturnValue(
      new Response(JSON.stringify({ error: "csrf_forbidden" }), { status: 403 })
    );
  });

  it("CSRF token 无效应返回 403", async () => {
    mockValidateCSRFToken.mockReturnValue(false);
    const req = new NextRequest("http://localhost/api/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        client_id: "test",
        redirect_uri: "https://example.com/cb",
        scope: "openid",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
