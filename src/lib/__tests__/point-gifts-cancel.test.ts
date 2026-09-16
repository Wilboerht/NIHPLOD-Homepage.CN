/**
 * 兑换取消退分（cancelRedemption）单元测试
 *
 * 覆盖：
 * - 记录不存在 → NOT_FOUND
 * - 非 PENDING（已履约/已取消）→ ALREADY_PROCESSED，不写退款
 * - CAS 抢占失败 → ALREADY_PROCESSED
 * - 成功：PENDING → CANCELLED，写入正向 ADJUST 退款流水（reference=cancel:{id}，幂等）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const txMock = {
  pointRedemption: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => {
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(txMock)),
  };
  return { prisma, default: prisma };
});

vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

vi.mock("@/lib/points-ledger", () => ({
  redeemPoints: vi.fn(),
  adjustPoints: vi.fn().mockResolvedValue({ duplicated: false }),
}));

import { cancelRedemption } from "@/lib/point-gifts";
import { adjustPoints } from "@/lib/points-ledger";

const PENDING = {
  id: "rd-1",
  userId: "user-1",
  points: 200,
  status: "PENDING",
  productName: "面膜礼盒",
};

describe("cancelRedemption 取消兑换退分", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txMock.pointRedemption.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(adjustPoints).mockResolvedValue({ duplicated: false });
  });

  it("记录不存在返回 NOT_FOUND", async () => {
    txMock.pointRedemption.findUnique.mockResolvedValue(null);

    const result = await cancelRedemption({ redemptionId: "rd-x" });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
    expect(adjustPoints).not.toHaveBeenCalled();
  });

  it("已履约记录不可取消", async () => {
    txMock.pointRedemption.findUnique.mockResolvedValue({ ...PENDING, status: "FULFILLED" });

    const result = await cancelRedemption({ redemptionId: "rd-1" });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ALREADY_PROCESSED");
    expect(txMock.pointRedemption.updateMany).not.toHaveBeenCalled();
    expect(adjustPoints).not.toHaveBeenCalled();
  });

  it("CAS 抢占失败（并发已取消）返回 ALREADY_PROCESSED", async () => {
    txMock.pointRedemption.findUnique.mockResolvedValue(PENDING);
    txMock.pointRedemption.updateMany.mockResolvedValue({ count: 0 });

    const result = await cancelRedemption({ redemptionId: "rd-1" });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ALREADY_PROCESSED");
    expect(adjustPoints).not.toHaveBeenCalled();
  });

  it("成功取消：改状态为 CANCELLED 并按幂等 reference 退还积分", async () => {
    txMock.pointRedemption.findUnique.mockResolvedValue(PENDING);

    const result = await cancelRedemption({ redemptionId: "rd-1", note: "缺货取消" });

    expect(result.ok).toBe(true);
    expect(result.points).toBe(200);
    expect(txMock.pointRedemption.updateMany).toHaveBeenCalledWith({
      where: { id: "rd-1", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect(adjustPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-1",
        amount: 200,
        reference: "cancel:rd-1",
        note: "缺货取消",
      })
    );
  });
});
