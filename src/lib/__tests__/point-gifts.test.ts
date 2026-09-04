/**
 * 积分兑换核心逻辑测试（兑换产品来自产品库）
 * 覆盖：兑礼率折算（普通档不参与）、兑换事务（幂等/产品校验/扣分/记录）、履约 CAS
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { txClient } = vi.hoisted(() => ({
  txClient: {
    pointRedemption: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    product: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
    product: { findMany: vi.fn() },
    pointRedemption: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/points-ledger", () => ({
  redeemPoints: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { redeemPoints } from "@/lib/points-ledger";
import {
  giftCostForUser,
  redeemGiftForUser,
  fulfillRedemption,
} from "@/lib/point-gifts";

const mockRedeemPoints = redeemPoints as ReturnType<typeof vi.fn>;
const mockTxFindUnique = txClient.pointRedemption.findUnique as ReturnType<typeof vi.fn>;
const mockTxCreate = txClient.pointRedemption.create as ReturnType<typeof vi.fn>;
const mockTxProductFind = txClient.product.findUnique as ReturnType<typeof vi.fn>;

const REDEEMABLE_PRODUCT = {
  id: "product-1",
  name: "洁面乳",
  price: new Prisma.Decimal("300.00"),
  pointRedeemable: true,
  published: true,
};

describe("giftCostForUser 兑礼率折算", () => {
  const price = new Prisma.Decimal("300.00");

  it("普通档不可兑礼（null），银/金/钻按 1 / 1.3 / 1.5 向下取整", () => {
    expect(giftCostForUser(price, "REGULAR")).toBeNull();
    expect(giftCostForUser(price, "SILVER")).toBe(300);
    expect(giftCostForUser(price, "GOLD")).toBe(230); // ⌊300/1.3⌋
    expect(giftCostForUser(price, "DIAMOND")).toBe(200);
  });

  it("价格极低时至少扣 1 分", () => {
    expect(giftCostForUser(new Prisma.Decimal("1.00"), "DIAMOND")).toBe(1);
  });
});

describe("redeemGiftForUser 兑换事务", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxFindUnique.mockResolvedValue(null);
    mockTxProductFind.mockResolvedValue(REDEEMABLE_PRODUCT);
    mockTxCreate.mockResolvedValue({ id: "redemption-1" });
    mockRedeemPoints.mockResolvedValue({ ok: true, available: 770, spent: 230 });
  });

  it("成功兑换：按等级折算扣分并生成兑换记录（含产品快照）", async () => {
    const result = await redeemGiftForUser({
      userId: "user-1",
      productId: "product-1",
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
        note: "兑换产品：洁面乳",
      })
    );
    expect(mockTxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        productId: "product-1",
        productName: "洁面乳",
        priceYuan: new Prisma.Decimal("300.00"),
        points: 230,
        reference: "redeem:user-1:req-1",
      }),
    });
  });

  it("同一请求单重复提交：幂等返回，不重复扣分", async () => {
    mockTxFindUnique.mockResolvedValue({ id: "redemption-1", points: 230 });

    const result = await redeemGiftForUser({
      userId: "user-1",
      productId: "product-1",
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

  it("产品不存在：PRODUCT_NOT_FOUND", async () => {
    mockTxProductFind.mockResolvedValue(null);
    const result = await redeemGiftForUser({
      userId: "user-1",
      productId: "product-x",
      requestId: "req-1",
      level: "GOLD",
    });
    expect(result).toMatchObject({ ok: false, code: "PRODUCT_NOT_FOUND" });
  });

  it("产品未标记可兑/未发布：PRODUCT_NOT_REDEEMABLE", async () => {
    mockTxProductFind.mockResolvedValue({ ...REDEEMABLE_PRODUCT, pointRedeemable: false });
    const result = await redeemGiftForUser({
      userId: "user-1",
      productId: "product-1",
      requestId: "req-1",
      level: "GOLD",
    });
    expect(result).toMatchObject({ ok: false, code: "PRODUCT_NOT_REDEEMABLE" });
  });

  it("普通档：NOT_ELIGIBLE", async () => {
    const result = await redeemGiftForUser({
      userId: "user-1",
      productId: "product-1",
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
      productId: "product-1",
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
