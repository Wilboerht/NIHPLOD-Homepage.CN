import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  advisorRequest: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/advisor-internal", () => ({
  advisorRequest: mocks.advisorRequest,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: mocks.warn, info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../overview/route";
import { verifyAuth } from "@/lib/auth";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

const dashboard = {
  overview: {
    totalUsers: 10,
    totalProducts: 5,
    totalSessions: 20,
    completedSessions: 15,
    todaySessions: 2,
    todayCompletions: 1,
    completionRate: 75,
  },
  skinTypeDistribution: [],
  weeklyGrowth: [],
  health: null,
  generatedAt: "2026-10-23T00:00:00.000Z",
};

function createRequest() {
  return new NextRequest("http://localhost/api/admin/subsites/advisor/overview", {
    method: "GET",
  } as never);
}

describe("GET /api/admin/subsites/advisor/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: dashboard },
    });
  });

  it("未登录返回 401", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(null as never);
    const res = await GET(createRequest());
    expect(res.status).toBe(401);
  });

  it("缺少 advisor:stats:read 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      id: "admin-2",
      email: "support@test.com",
      name: "Support",
      role: "support",
    } as never);
    const res = await GET(createRequest());
    expect(res.status).toBe(403);
  });

  it("成功返回子站概览", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/admin/dashboard",
      expect.objectContaining({ timeoutMs: 4000 })
    );
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { dashboard, degraded: false },
    });
  });

  it("子站不可用时返回 200 降级标记", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      status: 0,
      code: "UPSTREAM_ERROR",
      message: "子站服务连接失败",
    });
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { dashboard: null, degraded: true, reason: "upstream_error" },
    });
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("子站返回结构异常时按降级处理", async () => {
    mocks.advisorRequest.mockResolvedValue({ ok: true, status: 200, data: {} });
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { dashboard: null, degraded: true, reason: "upstream_error" },
    });
  });
});
