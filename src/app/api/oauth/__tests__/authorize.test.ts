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

// === Mock Prisma（UserConsent 查询）===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userConsent: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// === Mock JWT / user status / blacklist ===
vi.mock("@/lib/jwt", () => ({
  verifyUserToken: vi.fn().mockResolvedValue({ id: "user-1", phone: "13800138000", type: "user" }),
}));

vi.mock("@/lib/auth", () => ({
  checkUserStatus: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: vi.fn().mockReturnValue(false),
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
    id: "1",
    clientId: "test-client",
    name: "Test App",
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

// 有效的 PKCE code_challenge（43 字符 base64url）
const VALID_CODE_CHALLENGE = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const VALID_STATE = "abcdefghijklmnopqrstuvwx12345678"; // 32 chars, min required

function buildAuthorizeUrl(extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: "test-client",
    redirect_uri: "https://example.com/cb",
    scope: "openid",
    state: VALID_STATE,
    code_challenge: VALID_CODE_CHALLENGE,
    code_challenge_method: "S256",
    ...extra,
  });
  return `http://localhost/api/oauth/authorize?${params.toString()}`;
}

function createPostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/oauth/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "__Host-user_token=dummy-token",
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/oauth/authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("client_id 或 redirect_uri 缺失时应返回 400（不能安全重定向）", async () => {
    const req = new NextRequest(
      "http://localhost/api/oauth/authorize?response_type=code&redirect_uri=https://example.com/cb&scope=openid&state=abc123&code_challenge=aaa&code_challenge_method=S256"
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("response_type 不为 code 且 client/redirect_uri 合法时应 302 回传错误", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildAuthorizeUrl({ response_type: "token" }));
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://example.com/cb")).toBe(true);
    expect(location).toContain("error=unsupported_response_type");
    expect(location).toContain(`state=${VALID_STATE}`);
  });

  it("client 不存在应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(null);
    const req = new NextRequest(
      `http://localhost/api/oauth/authorize?response_type=code&client_id=nonexistent&redirect_uri=https://example.com/cb&scope=openid&state=${VALID_STATE}&code_challenge=${VALID_CODE_CHALLENGE}&code_challenge_method=S256`
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("redirect_uri 不在允许列表应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildAuthorizeUrl({ redirect_uri: "https://evil.com/cb" }));
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("scope 不在允许列表且 client/redirect_uri 合法时应 302 回传 invalid_scope", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue({
      ...validClient(),
      scopes: ["openid"],
    });
    const req = new NextRequest(buildAuthorizeUrl({ scope: "openid profile" }));
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_scope");
    expect(location).toContain("profile");
    expect(location).toContain(`state=${VALID_STATE}`);
  });

  it("scope 不被系统支持且 client/redirect_uri 合法时应 302 回传 invalid_scope", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildAuthorizeUrl({ scope: "openid admin" }));
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_scope");
  });

  it("PKCE method 不为 S256 且 client/redirect_uri 合法时应 302 回传错误", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildAuthorizeUrl({ code_challenge_method: "plain" }));
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_request");
  });

  it("缺少 code_challenge 且 client/redirect_uri 合法时应 302 回传错误", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(
      "http://localhost/api/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=https://example.com/cb&scope=openid&state=abcdefghijklmnopqrstuvwx12345678&code_challenge_method=S256"
    );
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_request");
    expect(location).toContain("code_challenge");
  });

  it("缺少 state 且 client/redirect_uri 合法时应 302 回传错误", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(
      "http://localhost/api/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=https://example.com/cb&scope=openid&code_challenge=aaa&code_challenge_method=S256"
    );
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_request");
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
    const req = createPostRequest({
      action: "approve",
      client_id: "test",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("client_id 或 redirect_uri 缺失时应返回 400（不能安全重定向）", async () => {
    const req = createPostRequest({
      action: "approve",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("client 不存在时应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(null);
    const req = createPostRequest({
      action: "approve",
      client_id: "nonexistent",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("redirect_uri 不在允许列表时应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://evil.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("action 非法且 client/redirect_uri 合法时应 302 回传 invalid_request", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = createPostRequest({
      action: "unknown",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_request");
    expect(location).toContain(`state=${VALID_STATE}`);
  });

  it("scope 非法且 client/redirect_uri 合法时应 302 回传 invalid_scope", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid admin",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_scope");
    expect(location).toContain(`state=${VALID_STATE}`);
  });

  it("PKCE 非法且 client/redirect_uri 合法时应 302 回传 invalid_request", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: "short",
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=invalid_request");
  });
});
