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
  apiConsole: {
    error: vi.fn(),
    warn: mocks.warn,
    info: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
  },
}));

import { GET } from "../analytics/route";
import { verifyAuth } from "@/lib/auth";

const OWNER = {
  id: "admin-1",
  email: "owner@test.com",
  name: "Owner",
  role: "owner",
};

const analytics = {
  funnel: {
    days: 30,
    totalSessions: 10,
    reportCompleted: 8,
    resultViewed: 6,
    reportCompletionRate: 80,
  },
  reportQuality: {
    days: 30,
    totalReports: 8,
    aiNarrative: 7,
    fallback: 1,
    fallbackRate: 12.5,
    avgDurationMs: 1000,
  },
  aiCosts: {
    period: "week",
    totalCost: 1.23,
    totalCalls: 10,
    failedCalls: 1,
    successRate: 90,
    avgDurationMs: 800,
  },
  failed: [],
  generatedAt: "2026-11-17T00:00:00.000Z",
};

function createRequest() {
  return new NextRequest(
    "http://localhost/api/admin/subsites/advisor/analytics",
    { method: "GET" } as never
  );
}

describe("GET /api/admin/subsites/advisor/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: analytics },
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

  it("成功返回分析摘要", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/admin/analytics",
      expect.objectContaining({ timeoutMs: 8000 })
    );
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { analytics, degraded: false },
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
      data: { analytics: null, degraded: true, reason: "upstream_error" },
    });
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("子站返回结构异常时按降级处理", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: {},
    });
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { analytics: null, degraded: true, reason: "upstream_error" },
    });
  });
});
