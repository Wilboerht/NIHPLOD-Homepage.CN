/**
 * 运营告警测试：兑换临期、自动取消结果、运营日报。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

const prismaMock = vi.hoisted(() => {
  const state = new Map<string, { lastSentAt: Date; lastCount: number }>();
  return {
    state,
    auditAlertState: {
      findUnique: vi.fn(async ({ where }: { where: { ruleKey: string } }) => {
        const row = state.get(where.ruleKey);
        return row ? { ruleKey: where.ruleKey, ...row } : null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { ruleKey: string };
          create: { lastSentAt: Date; lastCount: number };
        }) => {
          state.set(where.ruleKey, {
            lastSentAt: create.lastSentAt,
            lastCount: create.lastCount,
          });
          return { ruleKey: where.ruleKey, ...create };
        }
      ),
    },
    contactMessage: { count: vi.fn(), aggregate: vi.fn() },
    jobApplication: { count: vi.fn(), aggregate: vi.fn() },
    spentAdjustmentApplication: { count: vi.fn(), aggregate: vi.fn() },
    pointRedemption: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn() },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockSend = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wecom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wecom")>();
  return { ...actual, sendWecomNotification: mockSend };
});

import {
  notifyRedemptionAutoCancelled,
  sendOpsDailyDigest,
  sendRedemptionExpiryReminders,
} from "@/lib/ops-alert";

const NOW = new Date("2026-10-28T01:10:00Z");

describe("ops-alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.state.clear();
    mockSend.mockResolvedValue({ success: true });
  });

  it("T-7 无临期时不跳过 T-1 提醒", async () => {
    prismaMock.pointRedemption.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "rd-1",
        productName: "面霜小样",
        points: 100,
        createdAt: new Date(NOW.getTime() - 29 * 24 * 60 * 60 * 1000),
        user: { nickname: null, phone: "13800138000" },
      },
    ]);
    prismaMock.pointRedemption.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await sendRedemptionExpiryReminders(NOW);

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(mockSend.mock.calls[0][1]).toBe("ops");
    expect(content).toContain("T-1");
    expect(content).toContain("面霜小样");
    expect(content).toContain("138****8000");
  });

  it("自动取消结果发送运营告警", async () => {
    notifyRedemptionAutoCancelled({
      scanned: 3,
      cancelled: 2,
      skipped: 1,
      failed: 0,
      refundedPoints: 500,
    });

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(mockSend.mock.calls[0][1]).toBe("ops");
    expect(content).toContain("## 兑换超时自动取消");
    expect(content).toContain("已取消：2 笔");
    expect(content).toContain("退还积分：500");
  });

  it("运营日报汇总新增、待办、积压与库存", async () => {
    const oldest = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    prismaMock.contactMessage.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    prismaMock.jobApplication.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    prismaMock.spentAdjustmentApplication.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prismaMock.pointRedemption.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prismaMock.contactMessage.aggregate.mockResolvedValue({
      _count: 4,
      _min: { createdAt: oldest },
    });
    prismaMock.jobApplication.aggregate.mockResolvedValue({
      _count: 2,
      _min: { createdAt: oldest },
    });
    prismaMock.spentAdjustmentApplication.aggregate.mockResolvedValue({
      _count: 3,
      _sum: { amountClaimed: 5000 },
      _min: { createdAt: oldest },
    });
    prismaMock.pointRedemption.aggregate.mockResolvedValue({
      _count: 2,
      _min: { createdAt: oldest },
    });
    prismaMock.product.findMany.mockResolvedValue([{ name: "面霜小样", redeemStock: 0 }]);

    await sendOpsDailyDigest(NOW);

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    const content = mockSend.mock.calls[0][0] as string;
    expect(mockSend.mock.calls[0][1]).toBe("ops");
    expect(content).toContain("## 运营日报");
    expect(content).toContain("留言：5");
    expect(content).toContain("简历：3");
    expect(content).toContain("积分申请：2");
    expect(content).toContain("兑换申请：1");
    expect(content).toContain("申报 ¥5000");
    expect(content).toContain("留言未读 >24h：2");
    expect(content).toContain("面霜小样：剩余 0");
  });
});
