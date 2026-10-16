/**
 * OAuth SkinTestUsage 端点单元测试
 * GET /api/oauth/skin-test-usage
 *
 * 覆盖：未认证 401 / 缺 scope 403 / 用量透传 / 子站失败 fail-soft 返回 usage: null
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: vi.fn().mockReturnValue(false),
}));

const mockVerifyOAuthAccessToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyOAuthAccessToken: (...args: unknown[]) => mockVerifyOAuthAccessToken(...args),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: vi.fn(),
  scheduleSsoEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockFetchSkinTestUsage = vi.fn();
vi.mock("@/lib/skin-test-usage", () => ({
  fetchSkinTestUsage: (...args: unknown[]) => mockFetchSkinTestUsage(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) } },
}));

vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

import { GET } from "../skin-test-usage/route";

function makeRequest(authorized = true): NextRequest {
  return new NextRequest(new URL("http://localhost/api/oauth/skin-test-usage"), {
    method: "GET",
    ...(authorized ? { headers: { Authorization: "Bearer valid-token" } } : {}),
  } as never);
}

const usage = {
  level: null,
  totalUsed: 3,
  todayUsed: 1,
  quota: { lifetimeLimit: 10, dailyLimit: 3, unlimited: false },
  remaining: 7,
};

describe("/api/oauth/skin-test-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    mockFetchSkinTestUsage.mockResolvedValue(usage);
  });

  it("缺少 Authorization 返回 401", async () => {
    const res = await GET(makeRequest(false));
    expect(res.status).toBe(401);
  });

  it("scope 不含 membership 返回 403 insufficient_scope", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid profile",
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
    expect(mockFetchSkinTestUsage).not.toHaveBeenCalled();
  });

  it("透传子站测肤用量", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid membership",
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.usage).toEqual(usage);
    expect(mockFetchSkinTestUsage).toHaveBeenCalledWith("user-1");
  });

  it("子站失败 fail-soft：usage 返回 null 且状态仍 200", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid membership",
    });
    mockFetchSkinTestUsage.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.usage).toBeNull();
  });
});
