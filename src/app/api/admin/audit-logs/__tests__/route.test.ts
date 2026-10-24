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
  createAuditLogStrict: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sso-audit", () => ({
  escapeCSV: (val: string) => val,
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { GET } from "../route";
import { verifyAuth } from "@/lib/auth";
import { listAuditLogs, createAuditLog } from "@/lib/audit";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function createRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/audit-logs${query}`, {
    method: "GET",
  } as never);
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

  it("列表不返回完整 detail，无敏感权限时脱敏 IP/邮箱", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      id: "finance-1",
      email: "finance@test.com",
      name: "Finance",
      role: "finance",
    } as never);
    mockListAuditLogs.mockResolvedValue({
      items: [
        {
          id: "log-1",
          action: "login",
          targetType: "admin",
          targetId: null,
          targetLabel: "Owner <owner@test.com>",
          actorEmail: "alice@example.com",
          detail: { notes: "候选人张三，期望薪资 30k", status: "reviewed" },
          ipAddress: "1.2.3.4",
          userAgent: "UA",
          admin: { id: "admin-1", name: "Owner", email: "owner@test.com" },
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, nextCursor: null },
    });

    const res = await GET(createRequest("?action=login"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { items: Array<Record<string, unknown>> };
    };
    const item = body.data.items[0];
    expect(item.detail).toBeUndefined();
    expect(String(item.ipAddress)).not.toBe("1.2.3.4");
    expect(String(item.actorEmail)).not.toBe("alice@example.com");
    expect(String(item.targetLabel)).toContain("***");
  });

  it("默认只查询管理员操作，可通过 actorType 切换用户/全部", async () => {
    await GET(createRequest(""));
    expect(mockListAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, actorType: "ADMIN" })
    );

    await GET(createRequest("?actorType=USER"));
    expect(mockListAuditLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorType: "USER" })
    );

    await GET(createRequest("?actorType=ALL"));
    const lastArgs = mockListAuditLogs.mock.calls.at(-1)?.[0] as { actorType?: string };
    expect(lastArgs.actorType).toBeUndefined();
  });

  it("普通查询写入合并后的查看审计，而非导出审计", async () => {
    const res = await GET(createRequest("?outcome=FAILURE"));
    expect(res.status).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "audit_log_view",
        adminId: "admin-1",
        detail: expect.objectContaining({
          filters: expect.objectContaining({ outcome: "FAILURE" }),
        }),
      })
    );
    expect(createAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "audit_log_export" })
    );
  });
});
