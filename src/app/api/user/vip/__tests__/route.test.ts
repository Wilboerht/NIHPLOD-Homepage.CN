/**
 * GET /api/user/vip 路由测试（四档：普通/银卡/金卡/钻石）
 * 覆盖：会员编号、当前等级、下一等级与升级进度、四档权益列表
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

  it("普通会员（¥500）：下一等级为银卡，还差 ¥500，进度 50%", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "REGULAR",
      totalSpent: 500,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.memberId).toBe("CM123456");
    expect(data.data.membershipLevel).toBe("REGULAR");
    expect(data.data.nextLevel).toEqual(
      expect.objectContaining({ level: "SILVER", name: "银卡会员", spentNeeded: 500 })
    );
    // 四档权益齐全
    expect(data.data.allLevels.map((l: { level: string }) => l.level)).toEqual([
      "REGULAR",
      "SILVER",
      "GOLD",
      "DIAMOND",
    ]);
    // 里程碑体系已移除
    expect(data.data.milestones).toBeUndefined();
    expect(data.data.nextMilestone).toBeUndefined();
  });

  it("银卡会员（¥2,000）：下一等级为金卡，还差 ¥3,000", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "SILVER",
      totalSpent: 2000,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data.currentLevel.name).toBe("银卡会员");
    expect(data.data.nextLevel).toEqual(
      expect.objectContaining({ level: "GOLD", name: "金卡会员", spentNeeded: 3000 })
    );
  });

  it("金卡会员（¥8,000）：下一等级为钻石，还差 ¥2,000", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "GOLD",
      totalSpent: 8000,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data.currentLevel.name).toBe("金卡会员");
    expect(data.data.nextLevel).toEqual(
      expect.objectContaining({ level: "DIAMOND", spentNeeded: 2000, progress: 80 })
    );
  });

  it("钻石卡会员（¥12,000）：最高档，无下一等级", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "cm1234567890abc",
      membershipLevel: "DIAMOND",
      totalSpent: 12000,
    });

    const res = await GET(createRequest());
    const data = await res.json();

    expect(data.data.currentLevel.name).toBe("钻石卡会员");
    expect(data.data.nextLevel).toBeNull();
  });
});
