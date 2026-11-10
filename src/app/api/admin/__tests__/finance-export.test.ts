import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  redemptionFindMany: vi.fn(),
  spentFindMany: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn().mockResolvedValue({
    id: "admin-1",
    email: "owner@example.com",
    name: "Owner",
    role: "owner",
  }),
  checkAdminRateLimit: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/audit", () => ({ createAuditLogStrict: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pointRedemption: { findMany: mocks.redemptionFindMany },
    spentAdjustmentApplication: { findMany: mocks.spentFindMany },
  },
}));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

import { GET as exportRedemptions } from "../point-redemptions/export/route";
import { GET as exportSpentAdjustments } from "../spent-adjustments/export/route";

describe("财务 CSV 导出", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.audit.mockResolvedValue("audit-1");
  });

  it("兑换导出返回脱敏 CSV 并记录审计", async () => {
    mocks.redemptionFindMany.mockResolvedValue([
      {
        id: "rd-1",
        productName: "洁面乳",
        priceYuan: "300.00",
        points: 230,
        status: "PENDING",
        level: "GOLD",
        redeemRate: "1.30",
        clientId: null,
        waybillNo: null,
        refundedPoints: 0,
        createdAt: new Date("2026-11-01T00:00:00Z"),
        fulfilledAt: null,
        completedAt: null,
        cancelledAt: null,
        refundedAt: null,
        user: { id: "user-1", nickname: "测试", phone: "13800138000" },
      },
    ]);

    const response = await exportRedemptions(
      new NextRequest("http://localhost/api/admin/point-redemptions/export?status=PENDING")
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(csv).toContain("138****8000");
    expect(csv).not.toContain("13800138000");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "point_redemption_export" })
    );
  });

  it("补录导出包含撤销历史且不暴露完整手机号", async () => {
    mocks.spentFindMany.mockResolvedValue([
      {
        id: "app-1",
        channel: "TMALL",
        orderNo: "ORDER-1",
        dealerName: null,
        amountClaimed: 1200,
        purchasedAt: null,
        status: "PENDING",
        source: "USER",
        reviewAmount: null,
        reviewNote: null,
        reviewedAt: null,
        lastReviewAmount: 1200,
        undoReason: "订单核实有误",
        undoneAt: new Date("2026-11-02T00:00:00Z"),
        createdAt: new Date("2026-11-01T00:00:00Z"),
        user: { id: "user-1", nickname: "测试", phone: "13800138000" },
        reviewedBy: null,
      },
    ]);

    const response = await exportSpentAdjustments(
      new NextRequest("http://localhost/api/admin/spent-adjustments/export")
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain("订单核实有误");
    expect(csv).toContain("138****8000");
    expect(csv).not.toContain("13800138000");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "spent_adjustment_export" })
    );
  });
});
