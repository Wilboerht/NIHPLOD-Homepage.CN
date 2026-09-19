/**
 * OAuth Membership 端点单元测试
 * GET /api/oauth/membership
 *
 * 覆盖：未认证 401 / 缺 membership scope 403 / claims 结构（不含 skinTestUsage）
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
const mockBenefitFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    membershipBenefit: {
      findMany: (...args: unknown[]) => mockBenefitFindMany(...args),
    },
  },
}));

// === Mock OAuth CORS（避免测试依赖真实数据库查询 redirectUris）===
vi.mock("@/lib/oauth-cors", () => ({
  getOAuthCorsHeaders: vi.fn().mockResolvedValue({}),
}));

import { GET } from "../membership/route";

describe("GET /api/oauth/membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBlacklisted.mockReturnValue(false);
    // 默认 token 验证失败（401 路径）
    mockVerifyOAuthAccessToken.mockResolvedValue(null);
    // 默认 DB 无权益配置：回退 LEVEL_DEFAULT_BENEFITS
    mockBenefitFindMany.mockResolvedValue([]);
  });

  function getRequest() {
    return new Request("http://localhost/api/oauth/membership", {
      headers: { Authorization: "Bearer valid-token" },
    }) as unknown as NextRequest;
  }

  it("缺少 Authorization header 应返回 401", async () => {
    const req = new Request("http://localhost/api/oauth/membership");
    const res = await GET(req as unknown as NextRequest);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_token");
  });

  it("token 无效应返回 401", async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("scope 不含 membership 应返回 403 insufficient_scope", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid profile",
    });
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("scope 含 membership 时返回完整会员视图（不含 skinTestUsage 子站私有数据）", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "cm1234567890abc",
      client_id: "test-client",
      scope: "openid membership",
    });
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "GOLD",
      totalSpent: 6800,
    });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.sub).toBe("cm1234567890abc");
    expect(body.membershipLevel).toBe("GOLD");
    expect(body.memberId).toBe("CM123456");
    expect(body.totalSpent).toBe(6800);
    expect(body.currentLevel).toEqual(expect.objectContaining({ level: "GOLD", name: "金卡会员" }));
    expect(body.nextLevel).toEqual(
      expect.objectContaining({ level: "DIAMOND", spentNeeded: 3200 })
    );
    // 四档权益齐全（DB 无配置时回退默认）
    expect(body.allLevels.map((l: { level: string }) => l.level)).toEqual([
      "REGULAR",
      "SILVER",
      "GOLD",
      "DIAMOND",
    ]);
    // 子站私有数据不下发
    expect(body.skinTestUsage).toBeUndefined();
  });

  it("钻石卡会员：无下一等级（nextLevel 为 null）", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      membershipLevel: "DIAMOND",
      totalSpent: 12000,
    });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentLevel.name).toBe("钻石卡会员");
    expect(body.nextLevel).toBeNull();
  });

  it("用户不存在应返回 403 account_disabled", async () => {
    mockVerifyOAuthAccessToken.mockResolvedValue({
      id: "user-1",
      client_id: "test-client",
      scope: "openid membership",
    });
    mockUserFindUnique.mockResolvedValue(null);

    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_disabled");
  });
});
