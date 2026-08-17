/**
 * 用户 OAuth 授权撤销路由测试
 * POST /api/user/oauth/revoke
 *
 * 覆盖：
 * - CSRF 403 / 未认证 401 / 用户级限流 429 / 参数错误 400 / 无授权记录 404
 * - 撤销成功：级联撤销 session + consent + refreshToken，触发 Backchannel Logout 并记录审计；
 *   不再调用 blacklistUserTokens（access token 即时失效由 sid 会话校验承担，
 *   避免用户被误登出主站）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// vi.hoisted 共享 mock
// ============================================

const {
  mockVerifyUserAuth,
  mockValidateCSRFToken,
  mockRateLimit,
  mockRevokeRefreshToken,
  mockBlacklistUserTokens,
  mockSendBackchannelLogout,
  mockRecordSsoEvent,
  mockLogAuthEvent,
  prismaMock,
} = vi.hoisted(() => {
  const createMockModel = () => ({
    findMany: vi.fn(),
    updateMany: vi.fn(),
  });
  return {
    mockVerifyUserAuth: vi.fn(),
    mockValidateCSRFToken: vi.fn(),
    mockRateLimit: vi.fn(),
    mockRevokeRefreshToken: vi.fn(),
    mockBlacklistUserTokens: vi.fn(),
    mockSendBackchannelLogout: vi.fn(),
    mockRecordSsoEvent: vi.fn(),
    mockLogAuthEvent: vi.fn(),
    prismaMock: {
      oAuthSession: createMockModel(),
      userConsent: createMockModel(),
    } as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
  };
});

// ============================================
// Mock 模块
// ============================================

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));

vi.mock("@/lib/auth", () => ({
  verifyUserAuth: (...args: unknown[]) => mockVerifyUserAuth(...args),
  verifyAuth: vi.fn().mockResolvedValue(null),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: (...args: unknown[]) => mockValidateCSRFToken(...args),
  csrfForbiddenResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
      { status: 403 }
    ),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/client-ip", () => ({
  getClientIP: vi.fn().mockReturnValue("203.0.113.10"),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mockRecordSsoEvent(...args),
}));

vi.mock("@/lib/auth-logger", () => ({
  logAuthEvent: (...args: unknown[]) => mockLogAuthEvent(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() },
  logError: vi.fn(),
}));

vi.mock("@/lib/auth-security", () => ({
  revokeRefreshToken: (...args: unknown[]) => mockRevokeRefreshToken(...args),
}));

vi.mock("@/lib/token-blacklist", () => ({
  blacklistUserTokens: (...args: unknown[]) => mockBlacklistUserTokens(...args),
  removeFromBlacklist: vi.fn(),
  isTokenBlacklisted: vi.fn().mockReturnValue(false),
  isAccessTokenRevoked: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/backchannel-logout", () => ({
  sendBackchannelLogout: (...args: unknown[]) => mockSendBackchannelLogout(...args),
  isBlockedHostname: vi.fn().mockReturnValue(false),
}));

// ============================================
// 工具函数
// ============================================

function createRequest(body?: unknown) {
  const url = new URL("/api/user/oauth/revoke", "http://localhost:3000");
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init as never);
}

const USER = { id: "user-1", phone: "13800138000", nickname: "测试用户" };

// ============================================
// 测试套件
// ============================================

describe("POST /api/user/oauth/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyUserAuth.mockResolvedValue(USER);
    mockValidateCSRFToken.mockReturnValue(true);
    mockRateLimit.mockResolvedValue({ success: true, remaining: 9, reset: 99999, limit: 10 });
    mockRevokeRefreshToken.mockResolvedValue(undefined);
    mockBlacklistUserTokens.mockResolvedValue(undefined);
    mockSendBackchannelLogout.mockResolvedValue(undefined);
    mockRecordSsoEvent.mockResolvedValue(undefined);
  });

  it("CSRF 校验失败应返回 403", async () => {
    mockValidateCSRFToken.mockReturnValue(false);
    const { POST } = await import("@/app/api/user/oauth/revoke/route");
    const res = await POST(createRequest({ clientId: "client-abc" }));
    expect(res.status).toBe(403);
  });

  it("未认证应返回 401", async () => {
    mockVerifyUserAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/user/oauth/revoke/route");
    const res = await POST(createRequest({ clientId: "client-abc" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(prismaMock.oAuthSession.updateMany).not.toHaveBeenCalled();
  });

  it("用户级限流触发应返回 429", async () => {
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 99999, limit: 10 });
    const { POST } = await import("@/app/api/user/oauth/revoke/route");
    const res = await POST(createRequest({ clientId: "client-abc" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
    // 限流 key 按用户隔离
    expect(mockRateLimit).toHaveBeenCalledWith(
      "oauth-revoke:user-1",
      "default",
      expect.objectContaining({ maxRequests: 10 })
    );
    expect(prismaMock.oAuthSession.findMany).not.toHaveBeenCalled();
  });

  it("缺少 clientId 应返回 400", async () => {
    const { POST } = await import("@/app/api/user/oauth/revoke/route");
    const res = await POST(createRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("该 client 无授权记录应返回 404", async () => {
    prismaMock.oAuthSession.findMany.mockResolvedValue([]);
    const { POST } = await import("@/app/api/user/oauth/revoke/route");
    const res = await POST(createRequest({ clientId: "client-abc" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    expect(prismaMock.oAuthSession.updateMany).not.toHaveBeenCalled();
    expect(mockBlacklistUserTokens).not.toHaveBeenCalled();
  });

  it("撤销成功：级联撤销并触发 Backchannel Logout，不再调用 blacklistUserTokens", async () => {
    prismaMock.oAuthSession.findMany.mockResolvedValue([
      { id: "s1", sessionId: "sess-1" },
      { id: "s2", sessionId: "sess-2" },
    ]);
    prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.userConsent.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("@/app/api/user/oauth/revoke/route");
    const res = await POST(createRequest({ clientId: "client-abc" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // 撤销该 user+client 的全部活跃 session
    expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-abc", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // 撤销 consent，防止下次授权 auto-consent 跳过同意页
    expect(prismaMock.userConsent.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", clientId: "client-abc", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // 撤销 refresh token，防止旧 refresh_token 继续换发 access_token
    expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-abc");
    // 关键回归点：不再拉黑用户全部 token（会把用户误登出主站），
    // access token 即时失效由 sid 会话校验承担
    expect(mockBlacklistUserTokens).not.toHaveBeenCalled();
    // Backchannel Logout 通知 RP（sid 取撤销前查出的最新活跃会话）
    expect(mockSendBackchannelLogout).toHaveBeenCalledWith("user-1", ["client-abc"], {
      sids: { "client-abc": "sess-1" },
    });
    // 审计：SSO 事件 + 用户认证日志
    expect(mockRecordSsoEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "consent",
        userId: "user-1",
        clientId: "client-abc",
        detail: expect.objectContaining({ action: "revoke", sessionCount: 2 }),
      })
    );
    expect(mockLogAuthEvent).toHaveBeenCalledWith(
      "user_oauth_revoke",
      expect.objectContaining({ userId: "user-1", clientId: "client-abc", success: true })
    );
  });
});
