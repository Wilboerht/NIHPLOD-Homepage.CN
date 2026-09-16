/**
 * 积分账本人工调整（ADJUST）单元测试
 *
 * 覆盖：
 * - 正向调整：记 remaining + 6 个月过期，余额增加
 * - 负向调整：不记 remaining，余额冲减（可负）
 * - 幂等：同 reference 重复调用不重复入账
 * - 非法金额：抛错
 * - 过期清理：扫描类型包含 ADJUST（正向调整到期必须清零）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {};
  return { prisma, default: prisma };
});

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { adjustPoints, expirePoints } from "@/lib/points-ledger";

interface MockTx {
  pointLedger: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  pointBalance: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
}

function createMockTx(): MockTx {
  return {
    pointLedger: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    pointBalance: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
}

describe("adjustPoints 人工调整积分", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正向调整应记 remaining 与 6 个月过期并增加余额", async () => {
    const tx = createMockTx();

    const result = await adjustPoints(tx as never, {
      userId: "user-1",
      amount: 100,
      reference: "admin-adjust:req-1",
      note: "客服补偿",
    });

    expect(result.duplicated).toBe(false);
    expect(tx.pointLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          type: "ADJUST",
          amount: 100,
          remaining: 100,
          reference: "admin-adjust:req-1",
          note: "客服补偿",
          expiresAt: expect.any(Date),
          releasedAt: expect.any(Date),
        }),
      })
    );
    expect(tx.pointBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: { available: { increment: 100 } },
      })
    );
  });

  it("负向调整不应记 remaining，余额可为负", async () => {
    const tx = createMockTx();

    const result = await adjustPoints(tx as never, {
      userId: "user-1",
      amount: -30,
      reference: "admin-adjust:req-2",
    });

    expect(result.duplicated).toBe(false);
    const createArg = tx.pointLedger.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data).toMatchObject({ type: "ADJUST", amount: -30 });
    // 负向调整不应写入 remaining（不参与 FIFO 消耗/过期清理）
    expect(createArg.data.remaining).toBeUndefined();
    expect(tx.pointBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { available: { increment: -30 } },
      })
    );
  });

  it("同 reference 重复调用应幂等返回 duplicated", async () => {
    const tx = createMockTx();
    tx.pointLedger.findUnique.mockResolvedValue({ id: "ledger-1" });

    const result = await adjustPoints(tx as never, {
      userId: "user-1",
      amount: 50,
      reference: "admin-adjust:req-3",
    });

    expect(result.duplicated).toBe(true);
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
    expect(tx.pointBalance.upsert).not.toHaveBeenCalled();
  });

  it("金额为 0 或非整数应抛错", async () => {
    const tx = createMockTx();

    await expect(
      adjustPoints(tx as never, { userId: "user-1", amount: 0, reference: "r" })
    ).rejects.toThrow("POINT_ADJUST_INVALID_AMOUNT");

    await expect(
      adjustPoints(tx as never, { userId: "user-1", amount: 1.5, reference: "r" })
    ).rejects.toThrow("POINT_ADJUST_INVALID_AMOUNT");
  });
});

describe("expirePoints 扫描范围", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("过期清理类型应包含 ADJUST（正向调整到期需清零）", async () => {
    const tx = createMockTx();

    const total = await expirePoints(tx as never, "user-1");

    expect(total).toBe(0);
    expect(tx.pointLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: expect.arrayContaining(["CONSUME", "BIRTHDAY", "CHECKIN", "ADJUST"]) },
        }),
      })
    );
  });
});
