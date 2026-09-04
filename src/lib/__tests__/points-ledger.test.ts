/**
 * 积分账本核心逻辑测试
 * 覆盖：消费发放（立即到账/6 个月过期）、退款冲正（直接冲可用、可负）、
 *      兑礼 FIFO 消耗与幂等、过期扣减、生日积分（幂等/普通档不发）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { updateMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    pointLedger: { findMany: vi.fn() },
  },
}));

import {
  creditSpendPoints,
  refundSpendPoints,
  expirePoints,
  redeemPoints,
  grantBirthdayPoints,
  grantBirthdayRewards,
  getPointBalanceView,
  POINT_EXPIRY_MONTHS,
  type PointTx,
} from "@/lib/points-ledger";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-09-03T10:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

type MockTx = {
  pointLedger: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  pointBalance: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  user: { update: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
};

function createTx(): MockTx {
  const tx: MockTx = {
    pointLedger: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    pointBalance: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  tx.pointLedger.findUnique.mockResolvedValue(null);
  tx.pointLedger.findMany.mockResolvedValue([]);
  tx.pointLedger.create.mockResolvedValue({});
  tx.pointLedger.update.mockResolvedValue({});
  tx.pointBalance.findUnique.mockResolvedValue({ id: "bal-1" });
  tx.pointBalance.upsert.mockResolvedValue({});
  tx.pointBalance.update.mockResolvedValue({});
  tx.user.update.mockResolvedValue({});
  return tx;
}

const asTx = (tx: MockTx) => tx as unknown as PointTx;

describe("creditSpendPoints 消费发放", () => {
  let tx: MockTx;
  beforeEach(() => {
    tx = createTx();
  });

  it("发放：立即到账（无冻结）、6 个月过期、余额 available 增加", async () => {
    const result = await creditSpendPoints(asTx(tx), {
      userId: "user-1",
      amount: 1000,
      reference: "points:order-1",
    });

    expect(result).toEqual({ duplicated: false });
    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "CONSUME",
        amount: 1000,
        remaining: 1000,
        reference: "points:order-1",
        releasedAt: NOW,
        expiresAt: addMonths(NOW, POINT_EXPIRY_MONTHS),
      }),
    });
    expect(tx.pointBalance.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", available: 1000 },
      update: { available: { increment: 1000 } },
    });
  });

  it("重复 reference：跳过不重复发放", async () => {
    tx.pointLedger.findUnique.mockResolvedValue({ id: "ledger-1" });

    const result = await creditSpendPoints(asTx(tx), {
      userId: "user-1",
      amount: 1000,
      reference: "points:order-1",
    });

    expect(result).toEqual({ duplicated: true });
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
    expect(tx.pointBalance.upsert).not.toHaveBeenCalled();
  });
});

describe("refundSpendPoints 退款冲正", () => {
  let tx: MockTx;
  beforeEach(() => {
    tx = createTx();
  });

  it("直接冲可用余额（可负）", async () => {
    await refundSpendPoints(asTx(tx), {
      userId: "user-1",
      amount: 500,
      reference: "points:refund-1",
    });

    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "REFUND",
        amount: -500,
        reference: "points:refund-1",
      }),
    });
    expect(tx.pointBalance.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { available: { decrement: 500 } },
    });
  });

  it("无余额行（从未有积分余额）：仅记录退款流水，不冲余额", async () => {
    tx.pointBalance.findUnique.mockResolvedValue(null);

    await refundSpendPoints(asTx(tx), {
      userId: "user-1",
      amount: 300,
      reference: "points:refund-3",
    });

    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "REFUND",
        amount: -300,
        reference: "points:refund-3",
      }),
    });
    expect(tx.pointBalance.update).not.toHaveBeenCalled();
  });

  it("重复 reference：跳过", async () => {
    tx.pointLedger.findUnique.mockResolvedValue({ id: "ledger-1" });

    const result = await refundSpendPoints(asTx(tx), {
      userId: "user-1",
      amount: 300,
      reference: "points:refund-2",
    });

    expect(result).toEqual({ duplicated: true });
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
  });
});

describe("redeemPoints 兑礼扣减", () => {
  let tx: MockTx;
  beforeEach(() => {
    tx = createTx();
  });

  it("余额不足：返回 INSUFFICIENT 且不产生流水", async () => {
    tx.pointBalance.findUnique.mockResolvedValue({ available: 50 });

    const result = await redeemPoints(asTx(tx), {
      userId: "user-1",
      amount: 100,
      reference: "redeem:R1",
    });

    expect(result).toEqual({ ok: false, code: "INSUFFICIENT", available: 50 });
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
  });

  it("成功：FIFO 消耗最旧可用流水并扣减余额", async () => {
    tx.pointBalance.findUnique.mockResolvedValue({ available: 1000 });
    // 区分查询：物化（过期/释放）返回空，FIFO 消耗查询（releasedAt 非空过滤）返回流水
    tx.pointLedger.findMany.mockImplementation(
      async (args: { where?: { releasedAt?: unknown } }) => {
        const filter = args.where?.releasedAt;
        if (filter !== null && filter !== undefined) {
          return [
            { id: "r1", remaining: 400 },
            { id: "r2", remaining: 2000 },
          ];
        }
        return [];
      }
    );

    const result = await redeemPoints(asTx(tx), {
      userId: "user-1",
      amount: 600,
      reference: "redeem:R1",
    });

    expect(result).toEqual({ ok: true, available: 400, spent: 600 });
    expect(tx.pointLedger.update).toHaveBeenNthCalledWith(1, {
      where: { id: "r1" },
      data: { remaining: { decrement: 400 } },
    });
    expect(tx.pointLedger.update).toHaveBeenNthCalledWith(2, {
      where: { id: "r2" },
      data: { remaining: { decrement: 200 } },
    });
    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "REDEEM",
        amount: -600,
        reference: "redeem:R1",
      }),
    });
    expect(tx.pointBalance.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { available: { decrement: 600 } },
    });
  });

  it("重复 reference：幂等返回成功且不重复扣减", async () => {
    tx.pointLedger.findUnique.mockResolvedValue({ id: "ledger-1" });
    tx.pointBalance.findUnique.mockResolvedValue({ available: 400 });

    const result = await redeemPoints(asTx(tx), {
      userId: "user-1",
      amount: 600,
      reference: "redeem:R1",
    });

    expect(result).toEqual({ ok: true, available: 400, spent: 0 });
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
    expect(tx.pointBalance.update).not.toHaveBeenCalled();
  });
});

describe("expirePoints 过期扣减", () => {
  let tx: MockTx;
  beforeEach(() => {
    tx = createTx();
  });

  it("已释放流水过期：可用余额扣减（仅正数部分），流水清零，写 EXPIRE 流水", async () => {
    tx.pointLedger.findMany.mockResolvedValue([
      { id: "r1", remaining: 200, releasedAt: NOW },
      { id: "r2", remaining: 100, releasedAt: null },
    ]);
    tx.pointBalance.findUnique.mockResolvedValue({ available: 500, frozen: 100 });

    const total = await expirePoints(asTx(tx), "user-1", NOW);

    expect(total).toBe(300);
    expect(tx.pointBalance.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1" },
      update: { available: { decrement: 200 }, frozen: { decrement: 100 } },
    });
    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "EXPIRE",
        amount: -300,
        reference: `expire:user-1:${NOW.getTime()}`,
      }),
    });
  });

  it("负余额（超兑债务）不因过期减免", async () => {
    tx.pointLedger.findMany.mockResolvedValue([
      { id: "r1", remaining: 200, releasedAt: NOW },
    ]);
    tx.pointBalance.findUnique.mockResolvedValue({ available: -100, frozen: 0 });

    await expirePoints(asTx(tx), "user-1", NOW);

    // 可用余额为负时不做任何余额扣减（债务不减免），仅清零流水并记 EXPIRE 流水
    expect(tx.pointBalance.upsert).not.toHaveBeenCalled();
    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "EXPIRE", amount: -200 }),
    });
  });

  it("无过期流水：不写 EXPIRE 流水", async () => {
    tx.pointLedger.findMany.mockResolvedValue([]);

    const total = await expirePoints(asTx(tx), "user-1", NOW);

    expect(total).toBe(0);
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
  });
});

describe("grantBirthdayPoints 生日积分", () => {
  let tx: MockTx;
  beforeEach(() => {
    tx = createTx();
  });

  it("金卡生日：发 100 积分（直接可用、6 个月过期），写年度幂等标记", async () => {
    const result = await grantBirthdayPoints(asTx(tx), {
      userId: "user-1",
      level: "GOLD",
      year: 2026,
    });

    expect(result).toEqual({ granted: true, amount: 100 });
    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "BIRTHDAY",
        amount: 100,
        remaining: 100,
        reference: "birthday:user-1:2026",
        releasedAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    });
    expect(tx.pointBalance.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", available: 100 },
      update: { available: { increment: 100 } },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastBirthdayRewardYear: 2026 },
    });
  });

  it("普通会员：不发放", async () => {
    const result = await grantBirthdayPoints(asTx(tx), {
      userId: "user-1",
      level: "REGULAR",
      year: 2026,
    });

    expect(result).toEqual({ granted: false, amount: 0 });
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
  });
});

describe("grantBirthdayRewards 批量发放（cron）", () => {
  it("CAS 抢占成功：发放生日积分并计数", async () => {
    const tx = createTx();
    const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
    const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
    mockQueryRaw.mockResolvedValue([
      { id: "u1", membershipLevel: "GOLD" },
      { id: "u2", membershipLevel: "REGULAR" },
    ]);
    mockTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    tx.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await grantBirthdayRewards();

    expect(result).toEqual({ rewarded: 1, skipped: 1 });
    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        type: "BIRTHDAY",
        amount: 100,
        reference: `birthday:u1:${new Date().getFullYear()}`,
      }),
    });
  });

  it("CAS 抢占失败（并发已发）：跳过不重复发放", async () => {
    const tx = createTx();
    const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
    const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
    mockQueryRaw.mockResolvedValue([{ id: "u1", membershipLevel: "SILVER" }]);
    mockTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    const result = await grantBirthdayRewards();

    expect(result).toEqual({ rewarded: 0, skipped: 1 });
    expect(tx.pointLedger.create).not.toHaveBeenCalled();
  });
});

describe("getPointBalanceView 余额视图", () => {
  it("返回可用/冻结与解冻时间（无冻结期：frozen 恒 0、nextReleaseAt 恒 null，含物化）", async () => {
    const tx = createTx();
    tx.pointBalance.findUnique.mockResolvedValue({ available: 800, frozen: 0 });

    const view = await getPointBalanceView(asTx(tx), "user-1", NOW);

    expect(view).toEqual({ available: 800, frozen: 0, nextReleaseAt: null });
  });
});
