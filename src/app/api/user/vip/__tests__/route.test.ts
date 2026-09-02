/**
 * GET /api/user/vip 路由测试
 * 覆盖：等级/里程碑推导（解锁状态、下一里程碑进度）、会员编号、下一等级进度
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    membershipBenefit: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/auth", () => ({
  withUserAuth:
    (handler: (req: NextRequest, payload: { id: string }) => unknown) =>
    (req: NextRequest) =>
      handler(req, { id: "user-1" }),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/user/vip/route";

const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;

function createRequest(): NextRequest {
  return new NextRequest(new URL("/api/user/vip", "http://localhost:3000"), {
    method: "GET",
  } as never);
}

describe("GET /api/user/vip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("普通会员：无里程碑解锁，下一等级为高级（¥1,000 门槛）", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "REGULAR",
      totalSpent: 500,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.memberId).toBe("CM123456");
    expect(data.data.nextLevel.spentNeeded).toBe(500);
    expect(data.data.milestones.every((m: { unlocked: boolean }) => !m.unlocked)).toBe(true);
    expect(data.data.nextMilestone).not.toBeNull();
  });

  it("高级会员（¥2,000）：¥3,000 里程碑未解锁，进度 66%", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "ADVANCED",
      totalSpent: 2000,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.nextLevel).toBeNull();
    expect(data.data.milestones).toEqual([
      expect.objectContaining({ threshold: 3000, unlocked: false }),
      expect.objectContaining({ threshold: 10000, unlocked: false }),
    ]);
    expect(data.data.nextMilestone).toEqual(
      expect.objectContaining({ threshold: 3000, spentNeeded: 1000, progress: 67 })
    );
  });

  it("高级会员（¥3,200）：¥3,000 已解锁，下一里程碑为 ¥10,000", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "ADVANCED",
      totalSpent: 3200,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data.milestones).toEqual([
      expect.objectContaining({ threshold: 3000, unlocked: true }),
      expect.objectContaining({ threshold: 10000, unlocked: false }),
    ]);
    expect(data.data.nextMilestone.threshold).toBe(10000);
    expect(data.data.nextMilestone.spentNeeded).toBe(6800);
  });

  it("高级会员（¥12,000）：全部里程碑解锁，无下一里程碑", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "ADVANCED",
      totalSpent: 12000,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data.milestones.every((m: { unlocked: boolean }) => m.unlocked)).toBe(true);
    expect(data.data.nextMilestone).toBeNull();
  });
});
