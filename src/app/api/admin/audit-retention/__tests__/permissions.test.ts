/**
 * 审计保留接口权限回归测试
 *
 * 页面/导航要求 audit:retention:read；接口不能因为持有 audit:read 就放行，
 * 否则无页面权限的管理员可绕过 UI 直接读取保留预览和任务列表。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/audit-retention", () => ({
  buildRetentionPreview: vi.fn().mockResolvedValue({}),
  defaultRetentionCutoffs: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditRetentionJob: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { GET as previewGET } from "../preview/route";
import { GET as jobsGET } from "../jobs/route";
import { verifyAuth } from "@/lib/auth";

function createRequest(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

describe("审计保留接口权限", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("仅有 audit:read（历史 admin 角色）不能读取保留预览", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      permissionOverrides: [],
    } as never);

    const res = await previewGET(createRequest("/api/admin/audit-retention/preview"));

    expect(res.status).toBe(403);
  });

  it("仅有 audit:read（历史 admin 角色）不能读取保留任务列表", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      id: "admin-1",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      permissionOverrides: [],
    } as never);

    const res = await jobsGET(createRequest("/api/admin/audit-retention/jobs"));

    expect(res.status).toBe(403);
  });

  it("具备 audit:retention:read 的财务角色可读取预览和任务列表", async () => {
    vi.mocked(verifyAuth).mockResolvedValue({
      id: "finance-1",
      email: "finance@test.com",
      name: "Finance",
      role: "finance",
      permissionOverrides: [],
    } as never);

    expect((await previewGET(createRequest("/api/admin/audit-retention/preview"))).status).toBe(
      200
    );
    expect((await jobsGET(createRequest("/api/admin/audit-retention/jobs"))).status).toBe(200);
  });
});
