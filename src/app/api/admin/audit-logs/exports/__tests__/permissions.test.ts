/**
 * 审计导出接口权限回归测试
 *
 * 页面要求 audit:read；仅有 audit:export 不能绕过页面直接导出/查看导出任务。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/admin-totp", () => ({
  requireAdminStepUp: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
  createAuditLogStrict: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit-export", () => ({
  createAuditExportJob: vi.fn(),
  getAuditExportFilePath: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditExportJob: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
  },
}));

import { GET as listExports } from "../route";
import { GET as downloadExport } from "../[id]/download/route";
import { verifyAuth } from "@/lib/auth";

const EXPORT_ONLY = {
  id: "admin-1",
  email: "export@test.com",
  name: "Export",
  role: "finance",
  permissionOverrides: ["!audit:read"],
};

const FINANCE = {
  id: "finance-1",
  email: "finance@test.com",
  name: "Finance",
  role: "finance",
  permissionOverrides: [],
};

function createRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe("审计导出接口权限", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("只有 audit:export、没有 audit:read 时不能查看导出任务", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(EXPORT_ONLY as never);

    const res = await listExports(createRequest("/api/admin/audit-logs/exports"));

    expect(res.status).toBe(403);
  });

  it("只有 audit:export、没有 audit:read 时不能下载导出文件", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(EXPORT_ONLY as never);

    const res = await downloadExport(
      createRequest("/api/admin/audit-logs/exports/job-1/download"),
      {
        params: Promise.resolve({ id: "job-1" }),
      }
    );

    expect(res.status).toBe(403);
  });

  it("同时具备 audit:read 和 audit:export 的财务角色可查看导出任务", async () => {
    vi.mocked(verifyAuth).mockResolvedValue(FINANCE as never);

    const res = await listExports(createRequest("/api/admin/audit-logs/exports"));

    expect(res.status).toBe(200);
  });
});
