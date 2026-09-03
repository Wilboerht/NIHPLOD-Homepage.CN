/**
 * OAuth UserInfo 端点单元测试
 * GET /api/oauth/userinfo
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// === Mock ratelimit ===
vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// === Mock token-blacklist ===
const mockIsBlacklisted = vi.fn();
vi.mock("@/lib/token-blacklist", () => ({
  isTokenBlacklisted: (...args: unknown[]) => mockIsBlacklisted(...args),
}));

// === Mock jwt（verifyOAuthAccessToken）===
const mockVerifyOAuthAccessToken = vi.fn();
vi.mock("@/lib/jwt", () => ({
  verifyOAuthAccessToken: (...args: unknown[]) => mockVerifyOAuthAccessToken(...args),
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

// === Mock prisma ===
const mockUserFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

// === Mock OAuth CORS（避免测试依赖真实数据库查询 redirectUris）===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

import { GET } from "../userinfo/route";

describe("GET /api/oauth/userinfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    // 默认 token 验证失败（401 路径）
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
  });

  it("缺少 Authorization header 应返回 401", async () => {
    const req = new Request("http://localhost/api/oauth/userinfo");
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });

  it("Authorization header 格式错误（非 Bearer）应返回 401", async () => {
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Basic dGVzdDp0ZXN0" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it("Bearer token 为空应返回 401", async () => {
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer " },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it("token 无效（JWT 签名错误）应返回 401", async () => {
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(401);
  });

  it("用户被黑名单应返回 403 并携带 WWW-Authenticate 头", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid",
    });
    mockIsBlacklisted.mockReturnValue({ reason: "banned" });
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_disabled");
    // RFC 6750：错误响应必须携带 WWW-Authenticate 头
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("M2M token（显式 client_type=m2m claim）应仅返回 sub", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "client:test-client",
      client_id: "test-client",
      client_type: "m2m",
      scope: "",
    });
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer m2m-token" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sub: "client:test-client" });
  });

  it("scope 含 phone 时同时返回 phone（兼容保留）与标准 claim phone_number（均脱敏）", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid phone",
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      phone: "13812341234",
      nickname: "测试用户",
      avatar: null,
      birthday: null,
      status: "ACTIVE",
      membershipLevel: "REGULAR",
    });
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phone).toBe("138****1234");
    expect(body.phone_number).toBe("138****1234");
    expect(body.nickname).toBeUndefined();
    expect(body.birthday).toBeUndefined();
  });

  it("scope 含 birthday 时返回 ISO 8601 格式生日", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid birthday",
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      phone: "13812341234",
      nickname: null,
      avatar: null,
      birthday: new Date("1990-05-20T00:00:00.000Z"),
      status: "ACTIVE",
      membershipLevel: "REGULAR",
    });
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.birthday).toBe("1990-05-20T00:00:00.000Z");
    expect(body.phone).toBeUndefined();
    expect(body.phone_number).toBeUndefined();
  });

  it("scope 含 birthday 但用户未设置生日时返回 null", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid birthday",
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      phone: "13812341234",
      nickname: null,
      avatar: null,
      birthday: null,
      status: "ACTIVE",
      membershipLevel: "REGULAR",
    });
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.birthday).toBeNull();
  });

  it("scope 含 membership 时返回等级与积分兑礼率", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      phone: "13812341234",
      nickname: null,
      avatar: null,
      birthday: null,
      status: "ACTIVE",
      membershipLevel: "GOLD",
    });
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membership_level).toBe("GOLD");
    expect(body.points_redeem_rate).toBe(1.3);
  });

  it("普通档 scope 含 membership 时兑礼率为 null（不参与积分）", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      phone: "13812341234",
      nickname: null,
      avatar: null,
      birthday: null,
      status: "ACTIVE",
      membershipLevel: "REGULAR",
    });
    const req = new Request("http://localhost/api/oauth/userinfo", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membership_level).toBe("REGULAR");
    expect(body.points_redeem_rate).toBeNull();
  });
});
