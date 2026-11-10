import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  userFind: vi.fn(),
  balanceFind: vi.fn(),
  redemptionCount: vi.fn(),
  identityCount: vi.fn(),
  contactCount: vi.fn(),
  jobCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({ id: "admin-1", role: "owner" }),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFind },
    pointBalance: { findUnique: mocks.balanceFind },
    pointRedemption: { count: mocks.redemptionCount },
    externalIdentity: { count: mocks.identityCount },
    contactMessage: { count: mocks.contactCount },
    jobApplication: { count: mocks.jobCount },
  },
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET } from "../[id]/delete-preflight/route";

const userId = "ckz7q4g5v0000qz8x8f0d4h6a";
const context = { params: Promise.resolve({ id: userId }) };

describe("用户删除资产预检", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFind.mockResolvedValue({
      id: userId,
      phone: "13800138000",
      status: "ACTIVE",
      totalSpent: 3000,
    });
    mocks.balanceFind.mockResolvedValue({ available: 800 });
    mocks.redemptionCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    mocks.identityCount.mockResolvedValue(3);
    mocks.contactCount.mockResolvedValue(1);
    mocks.jobCount.mockResolvedValue(2);
  });

  it("返回积分、兑换、售后和独立表单数量", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/users/${userId}/delete-preflight`),
      context
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      userId,
      pointsAvailable: 800,
      pendingRedemptions: 2,
      activeAfterSales: 1,
      externalIdentities: 3,
      independentRecords: { contactMessages: 1, jobApplications: 2 },
    });
  });
});
