import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
const mockEventCreate = vi.fn();
const mockProductUpdateMany = vi.fn();
const mockQueryRaw = vi.fn();
const mockTx = {
  pointRedemption: { findUnique: mockFindUnique, updateMany: mockUpdateMany },
  pointRedemptionEvent: { create: mockEventCreate },
  product: { updateMany: mockProductUpdateMany },
  $queryRaw: mockQueryRaw,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockTx)),
    pointRedemption: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/points-ledger", () => ({
  withPointTxRetry: (fn: () => unknown) => fn(),
  adjustPoints: vi.fn().mockResolvedValue({ duplicated: false }),
}));

const mockEnqueue = vi.fn().mockResolvedValue("outbox-1");
vi.mock("@/lib/notification-outbox", () => ({
  enqueueNotification: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { adjustPoints } from "@/lib/points-ledger";
import {
  refundAfterSales,
  requestAfterSales,
  reviewAfterSales,
} from "@/lib/redemption-state-machine";

const baseRedemption = {
  id: "rd-1",
  userId: "user-1",
  productName: "测试礼品",
  points: 100,
  productId: "product-1",
  stockDeducted: true,
  restockApproved: true,
  stockRestored: false,
  fulfilledAt: new Date(),
  afterSalesApprovedAt: new Date(),
  user: { phone: "13800138000", status: "ACTIVE" },
};

describe("redemption state machine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockEventCreate.mockResolvedValue({});
    mockProductUpdateMany.mockResolvedValue({ count: 1 });
    mockQueryRaw.mockResolvedValue([{ id: "rd-1" }]);
    mockEnqueue.mockResolvedValue("outbox-1");
  });

  it("售后申请：COMPLETED 且在窗口内 → AFTER_SALES_REQUESTED", async () => {
    mockFindUnique.mockResolvedValue({ ...baseRedemption, status: "COMPLETED" });

    const result = await requestAfterSales({
      redemptionId: "rd-1",
      userId: "user-1",
      requestId: "req-1",
      reason: "商品破损",
    });

    expect(result).toEqual({ ok: true, status: "AFTER_SALES_REQUESTED" });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rd-1", status: "COMPLETED" },
        data: expect.objectContaining({ status: "AFTER_SALES_REQUESTED" }),
      })
    );
    expect(mockEventCreate).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it("售后申请：超过窗口期拒绝", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseRedemption,
      status: "COMPLETED",
      fulfilledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    });

    const result = await requestAfterSales({
      redemptionId: "rd-1",
      userId: "user-1",
      requestId: "req-1",
      reason: "商品破损",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AFTER_SALES_WINDOW_EXPIRED");
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("售后审核通过 → AFTER_SALES_APPROVED", async () => {
    mockFindUnique.mockResolvedValue({ ...baseRedemption, status: "AFTER_SALES_REQUESTED" });

    const result = await reviewAfterSales({
      redemptionId: "rd-1",
      adminId: "admin-1",
      approve: true,
    });

    expect(result).toEqual({ ok: true, status: "AFTER_SALES_APPROVED" });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "AFTER_SALES_APPROVED",
          afterSalesReviewedById: "admin-1",
        }),
      })
    );
  });

  it("退款：RETURNED → REFUNDED，退分并回补库存", async () => {
    mockFindUnique.mockResolvedValue({ ...baseRedemption, status: "RETURNED" });

    const result = await refundAfterSales({ redemptionId: "rd-1", adminId: "admin-1" });

    expect(result).toEqual({ ok: true, status: "REFUNDED", points: 100 });
    expect(adjustPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amount: 100,
        reference: "after-sales-refund:rd-1",
      })
    );
    expect(mockProductUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { redeemStock: { increment: 1 } } })
    );
  });

  it("退款：非 RETURNED 拒绝", async () => {
    mockFindUnique.mockResolvedValue({ ...baseRedemption, status: "COMPLETED" });

    const result = await refundAfterSales({ redemptionId: "rd-1", adminId: "admin-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_STATUS");
    expect(adjustPoints).not.toHaveBeenCalled();
  });
});
