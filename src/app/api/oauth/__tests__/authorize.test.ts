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
  scheduleSsoEvent: vi.fn(),
}));

// === Mock Prisma（UserConsent 查询）===
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userConsent: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

// === Mock oauth-code（授权码签发）===
vi.mock("@/lib/oauth-code", () => ({
  createAuthorizationCode: vi.fn().mockResolvedValue({ code: "test-auth-code" }),
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
import { createAuthorizationCode } from "@/lib/oauth-code";
import { verifyUserToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
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

  it("popup_nonce 在已授权自动签发时应原样透传到成功重定向", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    // 已授权过且 scope 未扩大：auto-approve 直接签发授权码
    (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      scopes: ["openid"],
      revokedAt: null,
    });
    const req = new NextRequest(buildAuthorizeUrl({ popup_nonce: "popup123" }), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("code=test-auth-code");
    expect(location).toContain("popup_nonce=popup123");
  });

  it("错误与成功重定向均应携带 iss 参数（RFC 9207）", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());

    // 错误重定向
    const errReq = new NextRequest(buildAuthorizeUrl({ response_type: "token" }));
    const errRes = await GET(errReq);
    expect(errRes.status).toBe(302);
    const errLocation = new URL(errRes.headers.get("location")!);
    expect(errLocation.searchParams.get("error")).toBe("unsupported_response_type");
    expect(errLocation.searchParams.get("iss")).toBe("http://localhost:3000");

    // 成功重定向（auto-approve）
    (prisma.userConsent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      scopes: ["openid"],
      revokedAt: null,
    });
    const okReq = new NextRequest(buildAuthorizeUrl(), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const okRes = await GET(okReq);
    expect(okRes.status).toBe(302);
    const okLocation = new URL(okRes.headers.get("location")!);
    expect(okLocation.searchParams.get("code")).toBe("test-auth-code");
    expect(okLocation.searchParams.get("iss")).toBe("http://localhost:3000");
  });

  it("popup_nonce 超过 64 字符应 302 回传 invalid_request", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildAuthorizeUrl({ popup_nonce: "x".repeat(65) }));
    const res = await GET(req);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=invalid_request");
  });

  it("prompt=none 且用户未登录时应回传 login_required 而非跳转登录页", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    // 无登录 Cookie → 未登录
    const req = new NextRequest(buildAuthorizeUrl({ prompt: "none" }));
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://example.com/cb")).toBe(true);
    expect(location).toContain("error=login_required");
  });

  it("prompt=none 且 max_age 超期时应回传 login_required", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    vi.mocked(verifyUserToken).mockResolvedValueOnce({
      id: "user-1",
      phone: "13800138000",
      type: "user",
      iat: Math.floor(Date.now() / 1000) - 3600, // 1 小时前认证
    } as never);
    const req = new NextRequest(buildAuthorizeUrl({ prompt: "none", max_age: "10" }), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=login_required");
  });

  it("max_age 以固化的 auth_time 为准：token 刷新（新 iat）后仍正确触发 re-auth", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    // 模拟 token 已经过多轮 refresh：iat 是刚换发的新时间，
    // auth_time 才是 1 小时前的真实认证时间；若以 iat 计算会错误放行
    vi.mocked(verifyUserToken).mockResolvedValueOnce({
      id: "user-1",
      phone: "13800138000",
      type: "user",
      iat: Math.floor(Date.now() / 1000) - 60, // 1 分钟前刚刷新
      auth_time: Math.floor(Date.now() / 1000) - 3600, // 实际 1 小时前认证
    } as never);
    const req = new NextRequest(buildAuthorizeUrl({ prompt: "none", max_age: "600" }), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("error=login_required");
  });

  it("prompt=none 且需要 consent 时应回传 consent_required 而非跳转 consent 页", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    // 默认 userConsent.findUnique → null（未授权）
    const req = new NextRequest(buildAuthorizeUrl({ prompt: "none" }), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://example.com/cb")).toBe(true);
    expect(location).toContain("error=consent_required");
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

  // 通过一次真实 GET 让服务端 storeOAuthParams 存储授权参数，取得有效 oauth_id
  // （POST approve 强制要求 oauth_id 防篡改比对）
  async function issueOauthId(extra: Record<string, string> = {}): Promise<string> {
    const getReq = new NextRequest(buildAuthorizeUrl(extra), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(302);
    const consentUrl = new URL(getRes.headers.get("location")!);
    const oauthId = consentUrl.searchParams.get("oauth_id");
    expect(oauthId).toBeTruthy();
    return oauthId!;
  }

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

  it("无 oauth_id 的 POST approve 应被拒绝（无法做防篡改比对）", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
      // 故意不传 oauth_id
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
    expect(body.error_description).toContain("oauth_id");
    // 不得持久化 consent、不得签发授权码
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(createAuthorizationCode).not.toHaveBeenCalled();
  });

  it("approve 携带空 scope 应 302 回传 invalid_scope", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "",
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

  it("授权成功重定向应原样透传 popup_nonce", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const oauthId = await issueOauthId({ popup_nonce: "popup123" });
    const req = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
      popup_nonce: "popup123",
      oauth_id: oauthId,
    });
    const res = await POST(req);
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toContain("code=test-auth-code");
    expect(location).toContain("popup_nonce=popup123");
  });

  it("授权成功与拒绝重定向均应携带 iss 参数（RFC 9207）", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());

    // 成功（approve）
    const oauthId = await issueOauthId();
    const approveReq = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
      oauth_id: oauthId,
    });
    const approveRes = await POST(approveReq);
    expect(approveRes.status).toBe(302);
    const approveLocation = new URL(approveRes.headers.get("location")!);
    expect(approveLocation.searchParams.get("code")).toBe("test-auth-code");
    expect(approveLocation.searchParams.get("iss")).toBe("http://localhost:3000");

    // 拒绝（deny）
    const denyReq = createPostRequest({
      action: "deny",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const denyRes = await POST(denyReq);
    expect(denyRes.status).toBe(302);
    const denyLocation = new URL(denyRes.headers.get("location")!);
    expect(denyLocation.searchParams.get("error")).toBe("access_denied");
    expect(denyLocation.searchParams.get("iss")).toBe("http://localhost:3000");
  });

  it("AJAX 请求（X-Requested-With）授权成功应返回 200 JSON 携带 redirectUrl 而非 302", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    // consent 页 fetch 场景：浏览器对 302 + redirect:manual 返回 opaqueredirect 读不到 Location，
    // 服务端对 AJAX 调用方改为 200 JSON 返回 redirectUrl，由前端自行跳转
    const oauthId = await issueOauthId({ popup_nonce: "popup123" });
    const req = new NextRequest("http://localhost/api/oauth/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "__Host-user_token=dummy-token",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        action: "approve",
        client_id: "test-client",
        redirect_uri: "https://example.com/cb",
        scope: "openid",
        state: VALID_STATE,
        code_challenge: VALID_CODE_CHALLENGE,
        code_challenge_method: "S256",
        popup_nonce: "popup123",
        oauth_id: oauthId,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.redirectUrl).toContain("code=test-auth-code");
    expect(body.data.redirectUrl).toContain("popup_nonce=popup123");
    expect(body.data.redirectUrl).toContain(`state=${VALID_STATE}`);
  });

  it("请求体非法 JSON 应返回 400 invalid_request 而非 500", async () => {
    const req = new NextRequest("http://localhost/api/oauth/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "__Host-user_token=dummy-token",
      },
      body: "{not-valid-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("携带 oauth_id 时回传参数与服务端存储不一致应返回 400；一致时正常签发并补齐 popup_nonce", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    // 先通过 GET 让服务端存储原始授权参数（已登录未授权 → 302 到 consent 页并携带 oauth_id）
    const getReq = new NextRequest(buildAuthorizeUrl({ popup_nonce: "popup123" }), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(302);
    const consentUrl = new URL(getRes.headers.get("location")!);
    const oauthId = consentUrl.searchParams.get("oauth_id")!;
    expect(oauthId).toBeTruthy();

    // 篡改 scope → 与服务端存储的原始参数不一致
    const tamperedReq = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid profile", // 存储值为 "openid"
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
      oauth_id: oauthId,
    });
    const tamperedRes = await POST(tamperedReq);
    expect(tamperedRes.status).toBe(400);
    const errBody = await tamperedRes.json();
    expect(errBody.error).toBe("invalid_request");

    // 参数一致 → 正常签发；popup_nonce 未回传时从服务端存储中补齐透传
    const okReq = createPostRequest({
      action: "approve",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid",
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
      oauth_id: oauthId,
    });
    const okRes = await POST(okReq);
    expect(okRes.status).toBe(302);
    const location = okRes.headers.get("location")!;
    expect(location).toContain("code=test-auth-code");
    expect(location).toContain("popup_nonce=popup123");
  });

  it("拒绝授权（deny）不再撤销既有 consent，仅回传 access_denied", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = createPostRequest({
      action: "deny",
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
      scope: "openid profile", // 模拟"拒绝扩大 scope"场景
      state: VALID_STATE,
      code_challenge: VALID_CODE_CHALLENGE,
      code_challenge_method: "S256",
    });
    const res = await POST(req);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=access_denied");
    // 不得撤销历史授权
    expect(prisma.userConsent.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/oauth/authorize 品牌化错误页", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("浏览器访问（Accept: text/html）且 client_id 无法识别时返回品牌化 HTML 错误页", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(null);
    const req = new NextRequest(buildAuthorizeUrl({ client_id: "nonexistent" }), {
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("应用配置有误或链接已失效");
    expect(html).toContain("invalid_request");
    expect(html).toContain("返回首页");
  });

  it("API 调用（无 text/html Accept）仍返回 JSON 错误", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(null);
    const req = new NextRequest(buildAuthorizeUrl({ client_id: "nonexistent" }));
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("限流时浏览器访问返回 429 品牌化 HTML 错误页", async () => {
    const { rateLimit } = await import("@/lib/ratelimit");
    vi.mocked(rateLimit).mockResolvedValueOnce({ success: false } as never);
    const req = new NextRequest(buildAuthorizeUrl(), {
      headers: { Accept: "text/html" },
    });
    const res = await GET(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("rate_limited");
  });

  it("consent 页重定向应附带 client_id/redirect_uri/state（供参数过期后取消授权）", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    // 已登录但未授权 → 302 到 consent 页
    const req = new NextRequest(buildAuthorizeUrl(), {
      headers: { Cookie: "__Host-user_token=dummy-token" },
    });
    const res = await GET(req);
    expect(res.status).toBe(302);
    const consentUrl = new URL(res.headers.get("location")!);
    expect(consentUrl.searchParams.get("mode")).toBe("consent");
    expect(consentUrl.searchParams.get("client_id")).toBe("test-client");
    expect(consentUrl.searchParams.get("redirect_uri")).toBe("https://example.com/cb");
    expect(consentUrl.searchParams.get("state")).toBe(VALID_STATE);
  });
});
