/**
 * 管理端用户授权（Consent）路由测试
 * GET/POST /api/admin/oauth/consents
 *
 * 覆盖：
 * - GET：非 owner 403 / 查的是 userConsent 而非 oAuthSession / 手机号脱敏
 * - POST：参数缺失 400 / 无活跃授权 404 /
 *         吊销仅更新已有 UserConsent（不创建 scopes:[] 空记录）/
 *         联动 revokeRefreshToken + Backchannel Logout，
 *         不再调用 blacklistUserTokens（即时失效由 sid 会话校验承担，避免误登出主站）
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
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
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
      userConsent: createMockModel(),
      oAuthSession: createMockModel(),
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

// ============================================
// 测试套件
// ============================================

describe("管理端用户授权 /api/admin/oauth/consents", () => {
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
    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue({ id: "a2", email: "a@t.com", name: "A", role: "admin" });
      const { GET } = await import("@/app/api/admin/oauth/consents/route");
      const res = await GET(createRequest("/api/admin/oauth/consents"));
      expect(res.status).toBe(403);
    });

    it("查询数据源应为 userConsent 而非 oAuthSession", async () => {
      prismaMock.userConsent.findMany.mockResolvedValue([]);
      prismaMock.userConsent.count.mockResolvedValue(0);

      const { GET } = await import("@/app/api/admin/oauth/consents/route");
      const res = await GET(createRequest("/api/admin/oauth/consents"));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(prismaMock.userConsent.findMany).toHaveBeenCalled();
      expect(prismaMock.userConsent.count).toHaveBeenCalled();
      // 授权列表来自 consent 记录，不是会话表
      expect(prismaMock.oAuthSession.findMany).not.toHaveBeenCalled();
      expect(data.data.items).toEqual([]);
    });

    it("status=active 过滤应带 revokedAt:null，手机号应脱敏", async () => {
      prismaMock.userConsent.findMany.mockResolvedValue([
        {
          id: "consent-1",
          userId: "user-1",
          clientId: "client-abc",
          scopes: ["openid", "phone"],
          grantedAt: new Date("2026-08-01T00:00:00Z"),
          revokedAt: null,
        },
      ]);
      prismaMock.userConsent.count.mockResolvedValue(1);
      prismaMock.user.findMany.mockResolvedValue([
        { id: "user-1", phone: "13912345678", nickname: "张三" },
      ]);
      prismaMock.oAuthClient.findMany.mockResolvedValue([
        { clientId: "client-abc", name: "Test App" },
      ]);

      const { GET } = await import("@/app/api/admin/oauth/consents/route");
      const res = await GET(createRequest("/api/admin/oauth/consents?status=active"));
      const data = await res.json();

      expect(res.status).toBe(200);
      const queryArgs = prismaMock.userConsent.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(queryArgs.where.revokedAt).toBeNull();

      expect(data.data.items[0].status).toBe("active");
      expect(data.data.items[0].phone).toBe("139****5678");
      expect(data.data.items[0].phone).not.toContain("123456");
      expect(data.data.items[0].clientName).toBe("Test App");
    });
  });

  // ------------------------------------------
  // POST — 管理员吊销用户授权
  // ------------------------------------------

  describe("POST", () => {
    it("CSRF 校验失败应返回 403", async () => {
      mockValidateCSRFToken.mockReturnValue(false);
      const { POST } = await import("@/app/api/admin/oauth/consents/route");
      const res = await POST(
        createRequest("/api/admin/oauth/consents", {
          method: "POST",
          body: { userId: "user-1", clientId: "client-abc" },
        })
      );
      expect(res.status).toBe(403);
    });

    it("非 owner 角色应返回 403", async () => {
      mockVerifyAuth.mockResolvedValue({ id: "a2", email: "a@t.com", name: "A", role: "admin" });
      const { POST } = await import("@/app/api/admin/oauth/consents/route");
      const res = await POST(
        createRequest("/api/admin/oauth/consents", {
          method: "POST",
          body: { userId: "user-1", clientId: "client-abc" },
        })
      );
      expect(res.status).toBe(403);
    });

    it("缺少 clientId 应返回 400", async () => {
      const { POST } = await import("@/app/api/admin/oauth/consents/route");
      const res = await POST(
        createRequest("/api/admin/oauth/consents", { method: "POST", body: { userId: "user-1" } })
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_PARAMS");
    });

    it("无活跃授权（session 与 consent 均无）应返回 404，且不产生任何 consent 写入", async () => {
      prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.userConsent.updateMany.mockResolvedValue({ count: 0 });

      const { POST } = await import("@/app/api/admin/oauth/consents/route");
      const res = await POST(
        createRequest("/api/admin/oauth/consents", {
          method: "POST",
          body: { userId: "user-1", clientId: "client-abc" },
        })
      );

      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
      // session 与 consent 均匹配 0 条（无实际写入），且不创建空 consent 记录
      expect(prismaMock.userConsent.create).not.toHaveBeenCalled();
      expect(prismaMock.userConsent.upsert).not.toHaveBeenCalled();
      expect(mockBlacklistUserTokens).not.toHaveBeenCalled();
      expect(mockSendBackchannelLogout).not.toHaveBeenCalled();
    });

    it("有 consent 但无活跃 session 时仍可撤销（不再误报 404）", async () => {
      prismaMock.oAuthSession.findMany.mockResolvedValue([]);
      prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.userConsent.updateMany.mockResolvedValue({ count: 1 });

      const { POST } = await import("@/app/api/admin/oauth/consents/route");
      const res = await POST(
        createRequest("/api/admin/oauth/consents", {
          method: "POST",
          body: { userId: "user-1", clientId: "client-abc" },
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data.revokedCount).toBe(1);
      expect(prismaMock.userConsent.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-abc", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockSendBackchannelLogout).toHaveBeenCalledWith("user-1", ["client-abc"], {
        sids: {},
      });
    });

    it("吊销成功：仅更新已有 consent（不创建空记录），联动登出通知但不再拉黑 token", async () => {
      prismaMock.oAuthSession.findMany.mockResolvedValue([{ sessionId: "sid-latest" }]);
      prismaMock.oAuthSession.updateMany.mockResolvedValue({ count: 2 });
      prismaMock.userConsent.updateMany.mockResolvedValue({ count: 1 });

      const { POST } = await import("@/app/api/admin/oauth/consents/route");
      const res = await POST(
        createRequest("/api/admin/oauth/consents", {
          method: "POST",
          body: { userId: "user-1", clientId: "client-abc" },
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      // revokedCount = 撤销的 session 数 + consent 数
      expect(data.data.revokedCount).toBe(3);

      // 撤销活跃 session
      expect(prismaMock.oAuthSession.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-abc", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // 关键回归点：仅 updateMany 已存在的 UserConsent，
      // 绝不为从未同意的用户创建 scopes:[] 空 consent 记录
      expect(prismaMock.userConsent.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", clientId: "client-abc", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.userConsent.create).not.toHaveBeenCalled();
      expect(prismaMock.userConsent.upsert).not.toHaveBeenCalled();

      // 同步撤销 refresh token + backchannel 通知；
      // 关键回归点：不再拉黑用户全部 token（会把用户误登出主站），
      // access token 即时失效由 sid 会话校验承担
      expect(mockRevokeRefreshToken).toHaveBeenCalledWith("user-1", undefined, "client-abc");
      expect(mockBlacklistUserTokens).not.toHaveBeenCalled();
      // sid 取撤销前查出的最新活跃会话
      expect(mockSendBackchannelLogout).toHaveBeenCalledWith("user-1", ["client-abc"], {
        sids: { "client-abc": "sid-latest" },
      });

      // SSO 审计事件
      expect(mockRecordSsoEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "consent",
          userId: "user-1",
          clientId: "client-abc",
          detail: expect.objectContaining({ action: "admin_revoke" }),
        })
      );
    });
  });
});
