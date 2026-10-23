import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { prismaMock, hasPermissionMock } = vi.hoisted(() => ({
  prismaMock: {
    contactMessage: { count: vi.fn() },
    accountDeletionRequest: { count: vi.fn() },
    spentAdjustmentApplication: { count: vi.fn() },
    pointRedemption: { count: vi.fn() },
    jobApplication: { count: vi.fn() },
  },
  hasPermissionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock, prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({
    id: "admin-1",
    email: "owner@test.com",
    name: "Owner",
    role: "owner",
  }),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/admin-permissions", () => ({
  hasAdminPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { GET } from "../route";

describe("GET /api/admin/nav-counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.contactMessage.count.mockResolvedValue(3);
    prismaMock.accountDeletionRequest.count.mockResolvedValue(2);
    prismaMock.spentAdjustmentApplication.count.mockResolvedValue(5);
    prismaMock.pointRedemption.count.mockResolvedValue(4);
    prismaMock.jobApplication.count.mockResolvedValue(6);
    hasPermissionMock.mockReturnValue(true);
  });

  it("返回留言/注销失败/消费待审核/兑换待履约/简历待处理数量", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      messages: 3,
      accountDeletions: 2,
      spentAdjustments: 5,
      pointRedemptions: 4,
      applications: 6,
    });
    expect(prismaMock.accountDeletionRequest.count).toHaveBeenCalledWith({
      where: { status: "FAILED" },
    });
    expect(prismaMock.spentAdjustmentApplication.count).toHaveBeenCalledWith({
      where: { status: "PENDING" },
    });
    expect(prismaMock.pointRedemption.count).toHaveBeenCalledWith({
      where: { status: "PENDING" },
    });
    expect(prismaMock.jobApplication.count).toHaveBeenCalledWith({
      where: { status: "pending" },
    });
  });

  it("无对应权限的模块返回 0 且不查询数据库", async () => {
    hasPermissionMock.mockImplementation((_admin: unknown, permission: string) => {
      return permission === "messages:read";
    });

    const res = await GET(new NextRequest("http://localhost/api/admin/nav-counts"));
    const body = await res.json();

    expect(body.data).toEqual({
      messages: 3,
      accountDeletions: 0,
      spentAdjustments: 0,
      pointRedemptions: 0,
      applications: 0,
    });
    expect(prismaMock.accountDeletionRequest.count).not.toHaveBeenCalled();
    expect(prismaMock.spentAdjustmentApplication.count).not.toHaveBeenCalled();
    expect(prismaMock.pointRedemption.count).not.toHaveBeenCalled();
    expect(prismaMock.jobApplication.count).not.toHaveBeenCalled();
  });
});
