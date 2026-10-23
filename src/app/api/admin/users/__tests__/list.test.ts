/**
 * 管理端用户列表 API 测试
 * GET /api/admin/users
 *
 * 覆盖：
 * - 手机号搜索仅精确匹配（equals），防逐位穷举枚举（S3）
 * - 旧 export=csv 入口返回 410，导出迁移到 /api/admin/users/export
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue(true),
  beginAuditLog: vi.fn().mockResolvedValue("audit-1"),
  finishAuditLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";
import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

const OWNER = { id: "admin-1", email: "owner@test.com", name: "Owner", role: "owner" };

function createRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/users${query}`, { method: "GET" } as never);
}

const mockFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const mockCount = prisma.user.count as ReturnType<typeof vi.fn>;

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAuth).mockResolvedValue(OWNER as never);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it("手机号搜索使用精确匹配（equals），不做 contains 模糊匹配", async () => {
    const res = await GET(createRequest("?search=13800138000"));
    expect(res.status).toBe(200);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ phone: { equals: "13800138000" } }]),
        }),
      })
    );
    // 不得包含任何 phone 模糊匹配条件
    const where = mockFindMany.mock.calls[0][0].where;
    const phoneCond = where.OR.find((c: Record<string, unknown>) => "phone" in c);
    expect(phoneCond.phone).not.toHaveProperty("contains");
  });

  it("无搜索词时不附加 OR 条件", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ OR: expect.anything() }) })
    );
  });

  it("旧导出入口返回 410 并指向新导出接口", async () => {
    const res = await GET(createRequest("?export=csv&search=13800138000&status=ACTIVE"));

    expect(res.status).toBe(410);
    const payload = await res.json();
    expect(payload.error.code).toBe("EXPORT_MOVED");
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("非导出请求不写导出审计日志", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
