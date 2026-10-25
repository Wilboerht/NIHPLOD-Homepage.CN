import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  advisorRequest: vi.fn(),
  createAuditLog: vi.fn(),
  beginAuditLog: vi.fn(),
  finishAuditLog: vi.fn(),
  validateCSRFToken: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    auditLog: { findFirst: vi.fn() },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/advisor-internal", () => ({
  advisorRequest: mocks.advisorRequest,
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: mocks.createAuditLog,
  beginAuditLog: mocks.beginAuditLog,
  finishAuditLog: mocks.finishAuditLog,
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: mocks.validateCSRFToken,
  csrfForbiddenResponse: () =>
    NextResponse.json(
      { success: false, error: { code: "CSRF_INVALID", message: "CSRF 校验失败" } },
      { status: 403 }
    ),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: mocks.warn, info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET, PATCH } from "../[id]/advisor/route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const USER_ID = "abcdefghijklmnopqrstuvwx";
const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

const overview = {
  account: {
    role: "user",
    dailyTestLimit: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-03-01T00:00:00.000Z",
  },
  usage: {
    level: "GOLD",
    totalUsed: 12,
    todayUsed: 2,
    quota: { lifetimeLimit: null, dailyLimit: 10, unlimited: true },
    remaining: null,
    todayCheckedIn: false,
  },
  counts: { sessions: 12, completedSessions: 11, diaryEntries: 3 },
  recentSessions: [],
  recentDiary: [],
};

function createRequest() {
  return new NextRequest(`http://localhost/api/admin/users/${USER_ID}/advisor`, {
    method: "GET",
  } as never);
}

function createPatchRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/users/${USER_ID}/advisor`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } as never);
}

const context = { params: Promise.resolve({ id: USER_ID }) };

const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockFindFirst = prisma.auditLog.findFirst as ReturnType<typeof vi.fn>;

describe("GET /api/admin/users/[id]/advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mockFindUnique.mockResolvedValue({
      id: USER_ID,
      membershipLevel: "GOLD",
      totalSpent: 6000,
      status: "ACTIVE",
    });
    mockFindFirst.mockResolvedValue(null);
    mocks.createAuditLog.mockResolvedValue(true);
    mocks.beginAuditLog.mockResolvedValue("audit-1");
    mocks.finishAuditLog.mockResolvedValue(true);
    mocks.validateCSRFToken.mockReturnValue(true);
  });

  it("未登录返回 401", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(null as never);
    const res = await GET(createRequest(), context);
    expect(res.status).toBe(401);
  });

  it("缺少 advisor:users:read 返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      id: "admin-2",
      email: "support@test.com",
      name: "Support",
      role: "support",
      permissionOverrides: ["!advisor:users:read"],
    } as never);
    const res = await GET(createRequest(), context);
    expect(res.status).toBe(403);
  });

  it("用户不存在返回 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(createRequest(), context);
    expect(res.status).toBe(404);
  });

  it("子站不可用时返回 200 降级标记", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      status: 0,
      code: "UPSTREAM_ERROR",
      message: "子站服务连接失败",
    });
    const res = await GET(createRequest(), context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { overview: null, degraded: true, reason: "upstream_error" },
    });
    expect(mocks.warn).toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("子站返回结构异常时按降级处理", async () => {
    mocks.advisorRequest.mockResolvedValue({ ok: true, status: 200, data: {} });
    const res = await GET(createRequest(), context);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { overview: null, degraded: true, reason: "upstream_error" },
    });
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("成功时透传主站会员覆盖并写查看审计", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: overview },
    });
    const res = await GET(createRequest(), context);
    expect(res.status).toBe(200);
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/admin/user-overview",
      expect.objectContaining({
        query: { userId: USER_ID, level: "GOLD", totalSpent: 6000 },
        signQuery: true,
        timeoutMs: 3000,
      })
    );
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { overview, degraded: false },
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "advisor_user_view",
        targetType: "user",
        targetId: USER_ID,
        adminId: "admin-1",
      })
    );
  });

  it("5 分钟内重复查看不重复写审计", async () => {
    mockFindFirst.mockResolvedValue({ id: "audit-existing" });
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: overview },
    });
    const res = await GET(createRequest(), context);
    expect(res.status).toBe(200);
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });
});

const updateResult = {
  changed: true,
  previous: { role: "user", dailyTestLimit: 10 },
  current: { role: "user", dailyTestLimit: 20 },
  revokedRefreshTokens: 0,
};

describe("PATCH /api/admin/users/[id]/advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mockFindUnique.mockResolvedValue({ id: USER_ID, status: "ACTIVE" });
    mocks.beginAuditLog.mockResolvedValue("audit-1");
    mocks.finishAuditLog.mockResolvedValue(true);
    mocks.validateCSRFToken.mockReturnValue(true);
  });

  it("CSRF 校验失败返回 403", async () => {
    mocks.validateCSRFToken.mockReturnValue(false);
    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(403);
    expect(vi.mocked(verifyAuth)).not.toHaveBeenCalled();
  });

  it("只有读权限时返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      id: "admin-2",
      email: "support@test.com",
      name: "Support",
      role: "support",
    } as never);
    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(403);
  });

  it("非法参数返回 400", async () => {
    const res = await PATCH(createPatchRequest({ dailyTestLimit: -1 }), context);
    expect(res.status).toBe(400);
    expect(mocks.beginAuditLog).not.toHaveBeenCalled();
  });

  it("用户不存在返回 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(404);
  });

  it("已注销用户返回 409", async () => {
    mockFindUnique.mockResolvedValue({ id: USER_ID, status: "DELETED" });
    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(409);
  });

  it("主站非 ACTIVE 时禁止启用子站账号", async () => {
    mockFindUnique.mockResolvedValue({ id: USER_ID, status: "SUSPENDED" });
    const res = await PATCH(createPatchRequest({ role: "user" }), context);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("MAIN_ACCOUNT_INACTIVE");
  });

  it("主站非 ACTIVE 时仍可调整每日上限", async () => {
    mockFindUnique.mockResolvedValue({ id: USER_ID, status: "SUSPENDED" });
    mocks.advisorRequest.mockResolvedValue({ ok: true, status: 200, data: { success: true, data: updateResult } });
    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(200);
  });

  it("审计不可用时拒绝操作", async () => {
    mocks.beginAuditLog.mockResolvedValue(null);
    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(503);
    expect(mocks.advisorRequest).not.toHaveBeenCalled();
  });

  it("成功时调用子站 PATCH 并完成审计", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: updateResult },
    });

    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(200);
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/admin/user",
      expect.objectContaining({
        method: "PATCH",
        query: { userId: USER_ID },
        body: expect.objectContaining({
          patch: { dailyTestLimit: 20 },
          operator: { id: "admin-1", email: "owner@test.com", name: "Owner" },
          mainAuditId: "audit-1",
        }),
        signQuery: true,
        timeoutMs: 5000,
      })
    );
    expect(mocks.beginAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "advisor_user_update",
        targetType: "user",
        targetId: USER_ID,
        adminId: "admin-1",
      })
    );
    expect(mocks.finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "SUCCESS",
      expect.objectContaining({
        previous: { role: "user", dailyTestLimit: 10 },
        current: { role: "user", dailyTestLimit: 20 },
      })
    );
    const body = await res.json();
    expect(body).toEqual({ success: true, data: updateResult });
  });

  it("子站返回结构异常时按上游错误处理", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: { changed: true } },
    });

    const res = await PATCH(createPatchRequest({ dailyTestLimit: 20 }), context);
    expect(res.status).toBe(502);
    expect(mocks.finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "FAILURE",
      expect.objectContaining({ reason: "INVALID_UPSTREAM_RESPONSE" })
    );
  });

  it("子站失败时写 FAILURE 审计并映射错误", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      status: 404,
      code: "UPSTREAM_ERROR",
      message: "User not found",
    });

    const res = await PATCH(createPatchRequest({ role: "disabled" }), context);
    expect(res.status).toBe(404);
    expect(mocks.finishAuditLog).toHaveBeenCalledWith(
      "audit-1",
      "FAILURE",
      expect.objectContaining({ code: "UPSTREAM_ERROR", status: 404 })
    );
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
