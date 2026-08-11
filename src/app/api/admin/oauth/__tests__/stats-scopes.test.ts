/**
 * SSO 概览统计与 Scope 列表路由测试
 * GET /api/admin/oauth/stats
 * GET /api/admin/oauth/scopes
 *
 * 覆盖：
 * - stats：非 owner 403 / 限流 429 / 基本口径（活跃 client、session、refreshToken 计数、
 *   成功率计算、事件分组）
 * - scopes：未认证 401 / 返回 SUPPORTED_SCOPES 动态列表
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// vi.hoisted 共享 mock
// ============================================

const { mockVerifyAuth, mockCheckAdminRateLimit, prismaMock } = vi.hoisted(() => {
  const createMockModel = () => ({
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  });
  return {
    mockVerifyAuth: vi.fn(),
    mockCheckAdminRateLimit: vi.fn(),
    prismaMock: {
      oAuthClient: createMockModel(),
      oAuthSession: createMockModel(),
      refreshToken: createMockModel(),
      ssoAuditEvent: createMockModel(),
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

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn() },
  logError: vi.fn(),
}));

// ============================================
// 工具函数
// ============================================

function createRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

const OWNER = { id: "admin-owner-1", email: "owner@test.com", name: "Owner", role: "owner" };

// ============================================
// 测试套件
// ============================================

describe("GET /api/admin/oauth/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
  });

  it("非 owner 角色应返回 403", async () => {
    mockVerifyAuth.mockResolvedValue({ id: "a2", email: "a@t.com", name: "A", role: "admin" });
    const { GET } = await import("@/app/api/admin/oauth/stats/route");
    const res = await GET(createRequest("/api/admin/oauth/stats"));
    expect(res.status).toBe(403);
  });

  it("限流触发应返回 429", async () => {
    mockCheckAdminRateLimit.mockResolvedValue(
      NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "请求过于频繁" } },
        { status: 429 }
      )
    );
    const { GET } = await import("@/app/api/admin/oauth/stats/route");
    const res = await GET(createRequest("/api/admin/oauth/stats"));
    expect(res.status).toBe(429);
  });

  it("基本口径：活跃计数按 revokedAt:null 过滤，成功率按本月事件计算", async () => {
    prismaMock.oAuthClient.count.mockResolvedValue(3);
    prismaMock.oAuthSession.count.mockResolvedValue(7);
    prismaMock.refreshToken.count.mockResolvedValue(5);
    // ssoAuditEvent.count 依次：today / week / month / successfulMonth / totalMonth
    prismaMock.ssoAuditEvent.count
      .mockResolvedValueOnce(10) // today
      .mockResolvedValueOnce(40) // week
      .mockResolvedValueOnce(100) // month
      .mockResolvedValueOnce(80) // successful (month)
      .mockResolvedValueOnce(100); // total (month)
    prismaMock.ssoAuditEvent.groupBy.mockResolvedValue([
      { event: "token", _count: { event: 60 } },
      { event: "authorize", _count: { event: 40 } },
    ]);

    const { GET } = await import("@/app/api/admin/oauth/stats/route");
    const res = await GET(createRequest("/api/admin/oauth/stats"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.activeClients).toBe(3);
    expect(data.data.activeSessions).toBe(7);
    expect(data.data.activeRefreshTokens).toBe(5);
    expect(data.data.events).toEqual({ today: 10, thisWeek: 40, thisMonth: 100 });
    expect(data.data.successRate).toBe(80);
    expect(data.data.eventsByType).toEqual({ token: 60, authorize: 40 });

    // 活跃 client 仅统计 isActive
    expect(prismaMock.oAuthClient.count).toHaveBeenCalledWith({ where: { isActive: true } });
    // 活跃 session / refreshToken 按未撤销 + 未过期过滤（与会话管理页口径一致）
    expect(prismaMock.oAuthSession.count).toHaveBeenCalledWith({
      where: { revokedAt: null, expiresAt: { gt: expect.any(Date) } },
    });
    expect(prismaMock.refreshToken.count).toHaveBeenCalledWith({
      where: { revokedAt: null, expiresAt: { gt: expect.any(Date) } },
    });
  });

  it("本月无事件时成功率默认为 100，避免除零", async () => {
    prismaMock.oAuthClient.count.mockResolvedValue(0);
    prismaMock.oAuthSession.count.mockResolvedValue(0);
    prismaMock.refreshToken.count.mockResolvedValue(0);
    prismaMock.ssoAuditEvent.count.mockResolvedValue(0);
    prismaMock.ssoAuditEvent.groupBy.mockResolvedValue([]);

    const { GET } = await import("@/app/api/admin/oauth/stats/route");
    const res = await GET(createRequest("/api/admin/oauth/stats"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.successRate).toBe(100);
  });
});

describe("GET /api/admin/oauth/scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue(OWNER);
    mockCheckAdminRateLimit.mockResolvedValue(null);
  });

  it("未认证应返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/oauth/scopes/route");
    const res = await GET(createRequest("/api/admin/oauth/scopes"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("返回服务端动态 scope 列表（与 SUPPORTED_SCOPES 同步）", async () => {
    const { GET } = await import("@/app/api/admin/oauth/scopes/route");
    const res = await GET(createRequest("/api/admin/oauth/scopes"));
    const data = await res.json();

    expect(res.status).toBe(200);
    const values = data.data.scopes.map((s: { value: string }) => s.value);
    expect(values).toEqual(["openid", "profile", "phone", "membership"]);
    // 每项带 label/desc，供管理端 Wizard 渲染
    expect(data.data.scopes[0]).toHaveProperty("label");
    expect(data.data.scopes[0]).toHaveProperty("desc");
  });
});
