/**
 * 积分礼品兑换核心逻辑测试
 * 覆盖：兑礼率折算（普通档不参与）、兑换事务（幂等/礼品校验/扣分/记录）、履约 CAS
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { txClient } = vi.hoisted(() => ({
  txClient: {
    pointRedemption: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    pointGift: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    pointGift: { findMany: vi.fn() },
    pointRedemption: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/points-ledger", () => ({
  redeemPoints: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { redeemPoints } from "@/lib/points-ledger";
import {
  giftCostForUser,
  redeemGiftForUser,
  fulfillRedemption,
} from "@/lib/point-gifts";

const mockRedeemPoints = redeemPoints as ReturnType<typeof vi.fn>;
const mockTxFindUnique = txClient.pointRedemption.findUnique as ReturnType<typeof vi.fn>;
const mockTxCreate = txClient.pointRedemption.create as ReturnType<typeof vi.fn>;
const mockTxGiftFind = txClient.pointGift.findUnique as ReturnType<typeof vi.fn>;

const ACTIVE_GIFT = {
  id: "gift-1",
  name: "品牌帆布袋",
  description: null,
  image: null,
  valueYuan: 300,
  sort: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("giftCostForUser 兑礼率折算", () => {
  it("普通档不参与（null），银/金/钻按 1 / 1.3 / 1.5 向下取整", () => {
    expect(giftCostForUser(300, "REGULAR")).toBeNull();
    expect(giftCostForUser(300, "SILVER")).toBe(300);
    expect(giftCostForUser(300, "GOLD")).toBe(230); // ⌊300/1.3⌋
    expect(giftCostForUser(300, "DIAMOND")).toBe(200);
  });

  it("价值极低时至少扣 1 分", () => {
    expect(giftCostForUser(1, "DIAMOND")).toBe(1);
  });
});

describe("redeemGiftForUser 兑换事务", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxFindUnique.mockResolvedValue(null);
    mockTxGiftFind.mockResolvedValue(ACTIVE_GIFT);
    mockTxCreate.mockResolvedValue({ id: "redemption-1" });
    mockRedeemPoints.mockResolvedValue({ ok: true, available: 770, spent: 230 });
  });

  it("成功兑换：按等级折算扣分并生成兑换记录", async () => {
    const result = await redeemGiftForUser({
      userId: "user-1",
      giftId: "gift-1",
      requestId: "req-1",
      level: "GOLD",
    });

    expect(result).toEqual({
      ok: true,
      duplicated: false,
      points: 230,
      available: 770,
      redemptionId: "redemption-1",
    });
    expect(mockRedeemPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        amount: 230,
        reference: "redeem:user-1:req-1",
        note: "兑换礼品：品牌帆布袋",
      })
    );
    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        giftId: "gift-1",
        giftName: "品牌帆布袋",
        valueYuan: 300,
        points: 230,
        reference: "redeem:user-1:req-1",
      }),
    });
  });

  it("同一请求单重复提交：幂等返回，不重复扣分", async () => {
    mockTxFindUnique.mockResolvedValue({ id: "redemption-1", points: 230 });

    const result = await redeemGiftForUser({
      userId: "user-1",
      giftId: "gift-1",
      requestId: "req-1",
      level: "GOLD",
    });

    expect(result).toEqual({
      ok: true,
      duplicated: true,
      points: 230,
      available: 0,
      redemptionId: "redemption-1",
    });
    expect(mockRedeemPoints).not.toHaveBeenCalled();
  });

  it("礼品不存在：GIFT_NOT_FOUND", async () => {
    mockTxGiftFind.mockResolvedValue(null);
    const result = await redeemGiftForUser({
      userId: "user-1",
      giftId: "gift-x",
      requestId: "req-1",
      level: "GOLD",
    });
    expect(result).toMatchObject({ ok: false, code: "GIFT_NOT_FOUND" });
  });

  it("礼品已下架：GIFT_INACTIVE", async () => {
    mockTxGiftFind.mockResolvedValue({ ...ACTIVE_GIFT, active: false });
    const result = await redeemGiftForUser({
      userId: "user-1",
      giftId: "gift-1",
      requestId: "req-1",
      level: "GOLD",
    });
    expect(result).toMatchObject({ ok: false, code: "GIFT_INACTIVE" });
  });

  it("普通档：NOT_ELIGIBLE", async () => {
    const result = await redeemGiftForUser({
      userId: "user-1",
      giftId: "gift-1",
      requestId: "req-1",
      level: "REGULAR",
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_ELIGIBLE" });
    expect(mockRedeemPoints).not.toHaveBeenCalled();
  });

  it("积分不足：INSUFFICIENT", async () => {
    mockRedeemPoints.mockResolvedValue({ ok: false, code: "INSUFFICIENT", available: 10 });
    const result = await redeemGiftForUser({
      userId: "user-1",
      giftId: "gift-1",
      requestId: "req-1",
      level: "GOLD",
    });
    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT" });
    expect(mockTxCreate).not.toHaveBeenCalled();
  });
});

describe("fulfillRedemption 履约", () => {
  const mockFindUnique = (prisma.pointRedemption as unknown as { findUnique: ReturnType<typeof vi.fn> })
    .findUnique;
  const mockUpdateMany = (prisma.pointRedemption as unknown as { updateMany: ReturnType<typeof vi.fn> })
    .updateMany;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PENDING → FULFILLED（CAS 抢占成功）", async () => {
    mockFindUnique.mockResolvedValue({ id: "r1", status: "PENDING" });
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await fulfillRedemption({ redemptionId: "r1", adminId: "admin-1" });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "r1", status: "PENDING" },
      data: { status: "FULFILLED", fulfilledAt: expect.any(Date) },
    });
  });

  it("记录不存在：NOT_FOUND", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await fulfillRedemption({ redemptionId: "r1", adminId: "admin-1" });
    expect(result).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("已处理：ALREADY_PROCESSED", async () => {
    mockFindUnique.mockResolvedValue({ id: "r1", status: "FULFILLED" });
    const result = await fulfillRedemption({ redemptionId: "r1", adminId: "admin-1" });
    expect(result).toEqual({ ok: false, code: "ALREADY_PROCESSED" });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
