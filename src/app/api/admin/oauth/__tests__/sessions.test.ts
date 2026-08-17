/**
 * 管理端 OAuth 会话管理路由测试
 * GET/POST/DELETE /api/admin/oauth/sessions
 *
 * 覆盖：
 * - GET：限流 429 / 非 owner 403 / 已过期未撤销 session 不计入活跃（where 含 expiresAt.gt）/
 *        手机号脱敏
 * - POST：两种终止模式（sessionId | userId+clientId）显式互斥 400 /
 *         session 不存在或已撤销 404 / 终止时联动 revokeRefreshToken，
 *         不再调用 blacklistUserTokens（即时失效由 sid 会话校验承担，避免误登出主站）
 * - DELETE：缺少 confirm 400 / 批量撤销并逐用户 Backchannel Logout 通知
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// vi.hoisted 共享 mock
// ============================================

const {
  mockVerifyAuth,
  mockCheckAdminRateLimit,
  mockValidateCSRFToken,
  mockRevokeRefreshToken,
  mockBlacklistUserTokens,
  mockSendBackchannelLogout,
  mockRecordSsoEvent,
  mockCreateAuditLog,
  prismaMock,
} = vi.hoisted(() => {
  const createMockModel = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  });
  return {
    mockVerifyAuth: vi.fn(),
    mockCheckAdminRateLimit: vi.fn(),
    mockValidateCSRFToken: vi.fn(),
    mockRevokeRefreshToken: vi.fn(),
    mockBlacklistUserTokens: vi.fn(),
    mockSendBackchannelLogout: vi.fn(),
    mockRecordSsoEvent: vi.fn(),
    mockCreateAuditLog: vi.fn(),
    prismaMock: {
      oAuthSession: createMockModel(),
      refreshToken: createMockModel(),
      user: createMockModel(),
      oAuthClient: createMockModel(),
    } as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
  };
});

// ============================================
// Mock 模块
// ============================================

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, default: prismaMock }));

vi.mock("@/lib/auth", () => ({
  verifyAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  checkAdminRateLimit: (...args: unknown[]) => mockCheckAdminRateLimit(...args),
  verifyUserAuth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 99, reset: 99999, limit: 30 }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: (...args: unknown[]) => mockValidateCSRFToken(...args),
  csrfForbiddenResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "CSRF_INVALID", message: "CSRF 验证失败" } },
      { status: 403 }
    ),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
}));

vi.mock("@/lib/sso-audit", () => ({
  recordSsoEvent: (...args: unknown[]) => mockRecordSsoEvent(...args),
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

function createRequest(path: string, options?: { method?: string; body?: unknown }) {
  const url = new URL(path, "http://localhost:3000");
  const init: RequestInit = { method: options?.method || "GET" };
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init as never);
}

const OWNER = { id: "admin-owner-1", email: "owner@test.com", name: "Owner", role: "owner" };

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    sessionId: "sess-abc",
    userId: "user-1",
    clientId: "client-abc",
    scopes: ["openid"],
    createdAt: new Date("2026-08-01T00:00:00Z"),
    expiresAt: new Date(Date.now() + 3600_000),
    revokedAt: null,
    ...overrides,
  };
}

// ============================================
// 测试套件
// ============================================

describe("管理端 OAuth 会话管理 /api/admin/oauth/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
    mockValidateCSRFToken.mockReturnValue(true);
    mockRevokeRefreshToken.mockResolvedValue(undefined);
    mockBlacklistUserTokens.mockResolvedValue(undefined);
    mockSendBackchannelLogout.mockResolvedValue(undefined);
    mockRecordSsoEvent.mockResolvedValue(undefined);
    mockCreateAuditLog.mockResolvedValue(true);
  });

  // ------------------------------------------
  // GET
  // ------------------------------------------

  describe("GET", () => {
    it("限流触发应返回 429", async () => {
      mockCheckAdminRateLimit.mockResolvedValue(
        NextResponse.json(
          { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
          { status: 429 }
        )
      );
      const { GET } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await GET(createRequest("/api/admin/oauth/sessions"));
      expect(res.status).toBe(429);
    });

    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue({ id: "a2", email: "a@t.com", name: "A", role: "admin" });
      const { GET } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await GET(createRequest("/api/admin/oauth/sessions"));
      expect(res.status).toBe(403);
    });

    it("活跃口径：已过期未撤销的 session 不计入（where 含 revokedAt:null + expiresAt.gt）", async () => {
      prismaMock.oAuthSession.findMany.mockResolvedValue([]);
      prismaMock.oAuthSession.count.mockResolvedValue(0);
      prismaMock.refreshToken.count.mockResolvedValue(0);

      const { GET } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await GET(createRequest("/api/admin/oauth/sessions"));
      const data = await res.json();

      expect(res.status).toBe(200);
      // OAuthSession 查询排除已过期记录
      const sessionWhere = prismaMock.oAuthSession.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(sessionWhere.where.revokedAt).toBeNull();
      expect(sessionWhere.where.expiresAt).toEqual({ gt: expect.any(Date) });
      // count 与 findMany 口径一致
      const countWhere = prismaMock.oAuthSession.count.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(countWhere.where.expiresAt).toEqual({ gt: expect.any(Date) });
      // RefreshToken 活跃数同样排除已过期
      const rtWhere = prismaMock.refreshToken.count.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(rtWhere.where).toEqual({ revokedAt: null, expiresAt: { gt: expect.any(Date) } });

      expect(data.data.stats.activeSessions).toBe(0);
      expect(data.data.stats.activeRefreshTokens).toBe(0);
    });

    it("列表项手机号应脱敏（138****8000）", async () => {
      prismaMock.oAuthSession.findMany.mockResolvedValue([makeSession()]);
      prismaMock.oAuthSession.count.mockResolvedValue(1);
      prismaMock.refreshToken.count.mockResolvedValue(1);
      prismaMock.user.findMany.mockResolvedValue([
        { id: "user-1", phone: "13800138000", nickname: "测试用户" },
      ]);
      prismaMock.oAuthClient.findMany.mockResolvedValue([
        { clientId: "client-abc", name: "Test App" },
      ]);

      const { GET } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await GET(createRequest("/api/admin/oauth/sessions"));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].phone).toBe("138****8000");
      expect(data.data.items[0].phone).not.toContain("0013800");
      expect(data.data.items[0].clientName).toBe("Test App");
      expect(data.data.stats.activeSessions).toBe(1);
    });
  });

  // ------------------------------------------
  // POST — 终止会话（两种模式互斥）
  // ------------------------------------------

  describe("POST", () => {
    it("CSRF 校验失败应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(false);
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", { method: "POST", body: { sessionId: "session-1" } })
      );
      expect(res.status).toBe(403);
    });

    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue({ id: "a2", email: "a@t.com", name: "A", role: "admin" });
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", { method: "POST", body: { sessionId: "session-1" } })
      );
      expect(res.status).toBe(403);
    });

    it("sessionId 与 userId 同时传入（两种模式混用）应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", {
          method: "POST",
          body: { sessionId: "session-1", userId: "user-1" },
        })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
      expect(prismaMock.oAuthSession.update).not.toHaveBeenCalled();
      expect(prismaMock.oAuthSession.updateMany).not.toHaveBeenCalled();
    });

    it("两种模式字段都缺失应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(createRequest("/api/admin/oauth/sessions", { method: "POST", body: {} }));
      expect(res.status).toBe(400);
    });

    it("多余未知字段应被 strict 模式拒绝（400），避免静默丢弃", async () => {
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", {
          method: "POST",
          body: { sessionId: "session-1", adminNote: "evil" },
        })
      );
      expect(res.status).toBe(400);
      expect(prismaMock.oAuthSession.update).not.toHaveBeenCalled();
    });

    it("sessionId 模式：session 不存在应返回 404", async () => {
      prismaMock.oAuthSession.findUnique.mockResolvedValue(null);
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", { method: "POST", body: { sessionId: "missing" } })
      );
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    });

    it("sessionId 模式：session 已撤销应返回 404", async () => {
      prismaMock.oAuthSession.findUnique.mockResolvedValue(
        makeSession({ revokedAt: new Date("2026-08-01T01:00:00Z") })
      );
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", { method: "POST", body: { sessionId: "session-1" } })
      );
      expect(res.status).toBe(404);
      expect(prismaMock.oAuthSession.update).not.toHaveBeenCalled();
    });

    it("sessionId 模式：终止成功应级联撤销同 client 全部会话并联动 revokeRefreshToken，不再调用 blacklistUserTokens", async () => {
      prismaMock.oAuthSession.findUnique.mockResolvedValue(makeSession());
      // 该用户在此 client 下有 2 条活跃会话（撤销前查询，sid 供 logout_token 携带）
      prismaMock.oAuthSession.findMany.mockResolvedValue([
        { id: "session-1", sessionId: "sid-1" },
        { id: "session-2", sessionId: "sid-2" },
      ]);
      prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 2 });

      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", { method: "POST", body: { sessionId: "session-1" } })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      // RefreshToken 无 sid 列，撤销粒度是 user+client，会话撤销与之对齐（级联）
      expect(data.data.terminatedCount).toBe(2);
      expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-abc", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // 同步撤销该 user+client 的 refresh token
      expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-abc");
      // 关键回归点：不再拉黑用户全部 token（会把用户误登出主站），
      // access token 即时失效由 sid 会话校验承担
      expect(mockBlacklistUserTokens).not.toHaveBeenCalled();
      // Backchannel Logout 通知，sid 取撤销前查出的最新活跃会话
      expect(mockSendBackchannelLogout).toHaveBeenCalledWith("user-1", ["client-abc"], {
        sids: { "client-abc": "sid-1" },
      });
    });

    it("userId 模式：无活跃会话应返回 404", async () => {
      prismaMock.oAuthSession.findMany.mockResolvedValue([]);
      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", { method: "POST", body: { userId: "user-1" } })
      );
      expect(res.status).toBe(404);
    });

    it("userId+clientId 模式：批量终止该 client 下会话，不再调用 blacklistUserTokens", async () => {
      prismaMock.oAuthSession.findMany.mockResolvedValue([
        { id: "s1", clientId: "client-abc", sessionId: "sid-1" },
        { id: "s2", clientId: "client-abc", sessionId: "sid-2" },
      ]);
      prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 2 });

      const { POST } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await POST(
        createRequest("/api/admin/oauth/sessions", {
          method: "POST",
          body: { userId: "user-1", clientId: "client-abc" },
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.terminatedCount).toBe(2);
      expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
          clientId: "client-abc",
        },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-abc");
      expect(mockBlacklistUserTokens).not.toHaveBeenCalled();
      // sid 取撤销前查出的最新活跃会话
      expect(mockSendBackchannelLogout).toHaveBeenCalledWith("user-1", ["client-abc"], {
        sids: { "client-abc": "sid-1" },
      });
    });
  });

  // ------------------------------------------
  // DELETE — 批量终止所有活跃会话
  // ------------------------------------------

  describe("DELETE", () => {
    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue({ id: "a2", email: "a@t.com", name: "A", role: "admin" });
      const { DELETE } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await DELETE(
        createRequest("/api/admin/oauth/sessions", { method: "DELETE", body: { confirm: true } })
      );
      expect(res.status).toBe(403);
    });

    it("缺少 confirm 应返回 400", async () => {
      const { DELETE } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await DELETE(
        createRequest("/api/admin/oauth/sessions", { method: "DELETE", body: {} })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("CONFIRM_REQUIRED");
      expect(prismaMock.oAuthSession.updateMany).not.toHaveBeenCalled();
    });

    it("批量撤销所有会话与 refresh token，并逐用户 Backchannel 通知（不再拉黑 token）", async () => {
      prismaMock.oAuthSession.findMany.mockResolvedValue([
        { userId: "user-1", clientId: "client-a", sessionId: "sid-a1" },
        { userId: "user-1", clientId: "client-b", sessionId: "sid-b1" },
        { userId: "user-2", clientId: "client-a", sessionId: "sid-a2" },
      ]);
      prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 3 });
      prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 5 });

      const { DELETE } = await import("@/app/api/admin/oauth/sessions/route");
      const res = await DELETE(
        createRequest("/api/admin/oauth/sessions", { method: "DELETE", body: { confirm: true } })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.sessionsRevoked).toBe(3);
      expect(data.data.refreshTokensRevoked).toBe(5);
      expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalledWith({
        where: { revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // 按用户聚合 backchannel 通知（user-1 聚合了两个 client），sid 取撤销前查出的活跃会话；
      // 关键回归点：不再逐用户拉黑 token（会把用户误登出主站），
      // access token 即时失效由 sid 会话校验承担
      expect(mockBlacklistUserTokens).not.toHaveBeenCalled();
      expect(mockSendBackchannelLogout).toHaveBeenCalledWith("user-1", ["client-a", "client-b"], {
        sids: { "client-a": "sid-a1", "client-b": "sid-b1" },
      });
      expect(mockSendBackchannelLogout).toHaveBeenCalledWith("user-2", ["client-a"], {
        sids: { "client-a": "sid-a2" },
      });
    });
  });
});
