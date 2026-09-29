/**
 * 管理端审计日志查询 API 测试
 * GET /api/admin/audit-logs
 *
 * 覆盖：export=csv 分支写入 audit_log_export 审计日志（筛选条件 + 导出条数）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/audit")>()),
  listAuditLogs: vi.fn(),
  createAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/sso-audit", () => ({
  escapeCSV: (val: string) => val,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";
import { verifyAuth } from "@/lib/auth";
import { listAuditLogs, createAuditLog } from "@/lib/audit";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function createRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/audit-logs${query}`, { method: "GET" } as never);
}

const mockListAuditLogs = listAuditLogs as ReturnType<typeof vi.fn>;

describe("GET /api/admin/audit-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    vi.mocked(createAuditLog).mockResolvedValue(true);
    mockListAuditLogs.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
  });

  it("export=csv 返回 CSV 并写入 audit_log_export 审计日志", async () => {
    mockListAuditLogs.mockResolvedValue({
      items: [
        {
          id: "log-1",
          action: "login",
          targetType: "admin",
          targetId: null,
          detail: {},
          ipAddress: "127.0.0.1",
          admin: { name: "Owner", email: "owner@test.com" },
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });

    const res = await GET(
      createRequest("?export=csv&action=login&startDate=2024-01-01&endDate=2024-01-31")
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit_log_export",
        targetType: "system",
        adminId: "admin-1",
        detail: expect.objectContaining({
          action: "login",
          exportedCount: 1,
          truncated: false,
        }),
      })
    );
  });

  it("非导出请求不写导出审计日志", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
