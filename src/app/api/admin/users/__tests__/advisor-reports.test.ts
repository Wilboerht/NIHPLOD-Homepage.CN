import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  advisorRequest: vi.fn(),
  audit: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/advisor-internal", () => ({ advisorRequest: mocks.advisorRequest }));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.audit }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: mocks.userFindUnique } },
}));

import { GET as listReports } from "../[id]/advisor/reports/route";
import { GET as getReport } from "../[id]/advisor/reports/[sessionId]/route";
import { verifyAuth } from "@/lib/auth";

const USER_ID = "clx000000000000000000001";
const SESSION_ID = "session-12345678";
const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };
const FINANCE = { id: "admin-2", email: "finance@test.com", name: "Finance", role: "finance" };

const listData = {
  reports: [
    {
      sessionId: SESSION_ID,
      createdAt: "2026-10-01T10:00:00.000Z",
      completedAt: "2026-10-01T10:10:00.000Z",
      overallScore: 82,
      skinTypeLabel: "混合偏干",
      persona: "desert",
      personaLabel: "沙漠派",
      reportVersion: 2,
      dataSource: "comprehensive",
      expired: false,
    },
  ],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

const reportData = {
  sessionId: SESSION_ID,
  createdAt: "2026-10-01T10:00:00.000Z",
  completedAt: "2026-10-01T10:10:00.000Z",
  expiresAt: null,
  expired: false,
  personaLabel: "沙漠派",
  summary: { overallScore: 82 },
  result: { reportVersion: 2, skinProfile: { type: "combination_dry", typeLabel: "混合偏干", concerns: [] }, analysis: { summary: "", details: [] } },
  faceAnalysis: null,
};

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, { method: "GET" } as never);
}

describe("admin advisor report BFF", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mocks.userFindUnique.mockResolvedValue({ id: USER_ID });
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: listData },
    });
  });

  it("列表返回摘要", async () => {
    const res = await listReports(
      request(`/api/admin/users/${USER_ID}/advisor/reports?page=1&limit=10`),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reports[0].sessionId).toBe(SESSION_ID);
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/admin/user-reports",
      expect.objectContaining({
        query: { userId: USER_ID, page: 1, limit: 10 },
        signQuery: true,
      })
    );
  });

  it("finance 无完整报告权限返回 403", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(FINANCE as never);
    const res = await listReports(
      request(`/api/admin/users/${USER_ID}/advisor/reports`),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    expect(res.status).toBe(403);
    expect(mocks.advisorRequest).not.toHaveBeenCalled();
  });

  it("详情成功并写查看审计", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { success: true, data: reportData },
    });
    const res = await getReport(
      request(`/api/admin/users/${USER_ID}/advisor/reports/${SESSION_ID}`),
      { params: Promise.resolve({ id: USER_ID, sessionId: SESSION_ID }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.advisorRequest).toHaveBeenCalledWith(
      "/api/internal/admin/user-report",
      expect.objectContaining({
        query: { userId: USER_ID, sessionId: SESSION_ID },
        signQuery: true,
      })
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "advisor_report_view",
        targetType: "user",
        targetId: USER_ID,
        detail: expect.objectContaining({ sessionId: SESSION_ID }),
      })
    );
  });

  it("非法 sessionId 返回 400", async () => {
    const res = await getReport(
      request(`/api/admin/users/${USER_ID}/advisor/reports/bad`),
      { params: Promise.resolve({ id: USER_ID, sessionId: "bad" }) }
    );
    expect(res.status).toBe(400);
  });

  it("子站 404 透传 404", async () => {
    mocks.advisorRequest.mockResolvedValue({
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "not found",
    });
    const res = await getReport(
      request(`/api/admin/users/${USER_ID}/advisor/reports/${SESSION_ID}`),
      { params: Promise.resolve({ id: USER_ID, sessionId: SESSION_ID }) }
    );
    expect(res.status).toBe(404);
  });
});
