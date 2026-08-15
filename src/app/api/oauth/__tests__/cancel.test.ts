/**
 * OAuth Cancel 端点单元测试
 * GET /api/oauth/cancel — SSO 登录页"返回"按钮：取消授权并 302 回传 access_denied
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

// === Mock logger ===
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "../cancel/route";
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

const VALID_STATE = "abcdefghijklmnopqrstuvwx12345678"; // 32 chars, min required

function buildCancelUrl(extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    client_id: "test-client",
    redirect_uri: "https://example.com/cb",
    state: VALID_STATE,
    ...extra,
  });
  return `http://localhost/api/oauth/cancel?${params.toString()}`;
}

describe("GET /api/oauth/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("参数合法时应 302 回传 error=access_denied 到子项目回调（含 state + iss）", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildCancelUrl());
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://example.com/cb");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("error_description")).toBe("用户取消了登录");
    expect(location.searchParams.get("state")).toBe(VALID_STATE);
    expect(location.searchParams.get("iss")).toBe("http://localhost:3000");
  });

  it("client 不存在时应返回 400（不能安全重定向）", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(null);
    const req = new NextRequest(buildCancelUrl());
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("redirect_uri 不在 client 注册列表时应返回 400（防开放重定向）", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildCancelUrl({ redirect_uri: "https://evil.com/cb" }));
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("state 缺失或长度不足时应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const shortReq = new NextRequest(buildCancelUrl({ state: "short" }));
    const shortRes = await GET(shortReq);
    expect(shortRes.status).toBe(400);

    const params = new URLSearchParams({
      client_id: "test-client",
      redirect_uri: "https://example.com/cb",
    });
    const missingReq = new NextRequest(`http://localhost/api/oauth/cancel?${params.toString()}`);
    const missingRes = await GET(missingReq);
    expect(missingRes.status).toBe(400);
  });

  it("client_id 或 redirect_uri 缺失时应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const params = new URLSearchParams({
      redirect_uri: "https://example.com/cb",
      state: VALID_STATE,
    });
    const req = new NextRequest(`http://localhost/api/oauth/cancel?${params.toString()}`);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("popup_nonce 应原样透传到重定向 URL", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildCancelUrl({ popup_nonce: "popup123" }));
    const res = await GET(req);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("popup_nonce")).toBe("popup123");
    expect(location.searchParams.get("error")).toBe("access_denied");
  });

  it("popup_nonce 超过 64 字符应返回 400", async () => {
    vi.mocked(getOAuthClientByClientId).mockResolvedValue(validClient());
    const req = new NextRequest(buildCancelUrl({ popup_nonce: "x".repeat(65) }));
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
