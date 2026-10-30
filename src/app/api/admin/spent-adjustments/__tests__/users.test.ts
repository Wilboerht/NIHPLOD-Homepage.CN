/**
 * 代客补录目标用户检索 API 测试
 * GET /api/admin/spent-adjustments/users
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
  },
  default: {
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { verifyAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/admin/spent-adjustments/users/route";

const mockVerifyAuth = verifyAuth as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

function searchRequest(search: string): NextRequest {
  return new NextRequest(
    new URL(
      `/api/admin/spent-adjustments/users?search=${encodeURIComponent(search)}`,
      "http://localhost:3000"
    )
  );
}

describe("GET /api/admin/spent-adjustments/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAuth.mockResolvedValue({
      id: "admin-1",
      role: "support",
      name: "客服A",
      email: "support@example.com",
    });
    mockFindMany.mockResolvedValue([]);
  });

  it("未登录返回 401", async () => {
    mockVerifyAuth.mockResolvedValue(null);

    const res = await GET(searchRequest("13800138000"));

    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("无 spent:create 权限返回 403", async () => {
    mockVerifyAuth.mockResolvedValue({ id: "admin-2", role: "finance" });

    const res = await GET(searchRequest("13800138000"));

    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("空搜索词返回 400", async () => {
    const res = await GET(searchRequest("  "));

    expect(res.status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("返回脱敏手机号与状态/等级", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "user-1",
        phone: "13800138000",
        nickname: "张三",
        status: "ACTIVE",
        membershipLevel: "SILVER",
      },
    ]);

    const res = await GET(searchRequest("13800138000"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.users).toEqual([
      {
        id: "user-1",
        phone: "138****8000",
        nickname: "张三",
        status: "ACTIVE",
        membershipLevel: "SILVER",
      },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: "DELETED" },
          OR: expect.arrayContaining([
            { id: { equals: "13800138000" } },
            { phone: { equals: "13800138000" } },
            { nickname: { contains: "13800138000", mode: "insensitive" } },
          ]),
        }),
        take: 8,
      })
    );
  });
});
