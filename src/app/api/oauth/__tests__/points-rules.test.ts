import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));
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
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) } },
}));

import { GET } from "../points/rules/route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/oauth/points/rules", {
    method: "GET",
    headers: { Authorization: "Bearer valid-token" },
  });
}

describe("GET /api/oauth/points/rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid membership",
    });
  });

  it("returns the authoritative rules", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.earnYuanPerPoint).toBe(1);
    expect(body.data.expiryMonths).toBe(6);
    expect(body.data.levels).toHaveLength(4);
  });

  it("requires membership scope", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "wechat-mp-points",
      scope: "openid",
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });
});
