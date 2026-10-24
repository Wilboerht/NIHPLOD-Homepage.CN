import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  pointRedemption: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  pointBalance: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  pointLedger: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  product: {
    updateMany: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  pointRedemption: { findMany: vi.fn() },
  $transaction: vi.fn(),
  auditLog: { create: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { expirePendingRedemptions } from "@/lib/point-gifts";

describe("expirePendingRedemptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    );
    prismaMock.pointRedemption.findMany.mockResolvedValue([
      {
        id: "redemption-1",
        userId: "user-1",
        productName: "面霜",
        points: 100,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit-1" });
    prismaMock.auditLog.update.mockResolvedValue({});
    tx.pointRedemption.findUnique.mockResolvedValue({
      id: "redemption-1",
      userId: "user-1",
      points: 100,
      status: "PENDING",
      productName: "面霜",
      productId: "product-1",
    });
    tx.pointRedemption.updateMany.mockResolvedValue({ count: 1 });
    tx.pointBalance.findUnique.mockResolvedValue({ available: 0 });
    tx.pointBalance.upsert.mockResolvedValue({});
    tx.pointLedger.findUnique.mockResolvedValue(null);
    tx.pointLedger.findMany.mockResolvedValue([]);
    tx.pointLedger.create.mockResolvedValue({});
    tx.product.updateMany.mockResolvedValue({ count: 1 });
  });

  it("超时 PENDING 自动取消、退分并写审计", async () => {
    const result = await expirePendingRedemptions({ days: 30 });

    expect(result).toEqual({ scanned: 1, cancelled: 1, skipped: 0, failed: 0 });
    expect(tx.pointRedemption.updateMany).toHaveBeenCalledWith({
      where: { id: "redemption-1", status: "PENDING" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
    expect(tx.pointLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "ADJUST",
        amount: 100,
        reference: "cancel:redemption-1",
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
    expect(prismaMock.auditLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "audit-1" },
        data: expect.objectContaining({ outcome: "SUCCESS" }),
      })
    );
  });
});
