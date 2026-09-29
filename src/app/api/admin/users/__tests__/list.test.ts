/**
 * 管理端用户列表 API 测试
 * GET /api/admin/users
 *
 * 覆盖：
 * - 手机号搜索仅精确匹配（equals），防逐位穷举枚举（S3）
 * - export=csv 分支写入 user_export 审计日志（筛选条件 + 导出条数，search 脱敏）
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

  it("export=csv 返回 CSV 并写入 user_export 审计日志（含筛选条件与条数）", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "user-1",
        phone: "13800138000",
        phoneVerified: true,
        nickname: "张三",
        avatar: null,
        status: "ACTIVE",
        membershipLevel: "REGULAR",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ]);

    const res = await GET(createRequest("?export=csv&search=13800138000&status=ACTIVE"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    // CSV 中手机号脱敏
    expect(text).toContain("138****8000");
    expect(text).not.toContain("13800138000");

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_export",
        targetType: "user",
        adminId: "admin-1",
        detail: {
          search: "138****8000",
          status: "ACTIVE",
          exportedCount: 1,
        },
      })
    );
  });

  it("非导出请求不写导出审计日志", async () => {
    const res = await GET(createRequest());
    expect(res.status).toBe(200);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
