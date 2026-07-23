import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => {
  const orderMock = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };

  const tx = {
    order: orderMock, // 事务内复用同一个 order mock
  };

  const prisma = {
    order: orderMock,
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return { prisma };
});

// Mock logger
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock sf-express
vi.mock("@/lib/sf-express", () => ({
  querySFExpressRoute: vi.fn().mockResolvedValue({ success: false, error: "not configured" }),
}));

// Mock logistics-constants
vi.mock("@/lib/logistics-constants", () => ({
  LOGISTICS_COMPANIES: [
    { code: "SF", name: "顺丰速运" },
    { code: "YTO", name: "圆通速递" },
    { code: "ZTO", name: "中通快递" },
  ],
}));

import { prisma } from "@/lib/prisma";
import { shipOrder, queryLogistics, confirmReceipt } from "@/lib/logistics";

const mockOrder = prisma.order as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe("物流服务", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("shipOrder - 发货", () => {
    it("PAID 订单应成功发货", async () => {
      mockOrder.findUnique.mockResolvedValue({
        id: "order-1",
        orderNo: "20240101000000123456",
        status: "PAID",
      });

      const result = await shipOrder("order-1", "SF", "SF1234567890");

      expect(result.success).toBe(true);
      expect(mockOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1" },
          data: expect.objectContaining({
            status: "SHIPPED",
            shippingCompany: "SF",
            trackingNo: "SF1234567890",
            shippedAt: expect.any(Date),
          }),
        })
      );
    });

    it("PROCESSING 订单也可发货", async () => {
      mockOrder.findUnique.mockResolvedValue({
        id: "order-1",
        orderNo: "20240101000000123456",
        status: "PROCESSING",
      });

      const result = await shipOrder("order-1", "YTO", "YT9876543210");
      expect(result.success).toBe(true);
    });

    it("PENDING 订单不可发货（状态不合法）", async () => {
      mockOrder.findUnique.mockResolvedValue({
        id: "order-1",
        orderNo: "20240101000000123456",
        status: "PENDING",
      });

      const result = await shipOrder("order-1", "SF", "SF1234567890");

      expect(result.success).toBe(false);
      expect(result.error).toContain("状态不正确");
    });

    it("SHIPPED 订单不可重复发货", async () => {
      mockOrder.findUnique.mockResolvedValue({
        id: "order-1",
        orderNo: "20240101000000123456",
        status: "SHIPPED",
      });

      const result = await shipOrder("order-1", "SF", "SF1234567890");

      expect(result.success).toBe(false);
      expect(result.error).toContain("状态不正确");
    });

    it("订单不存在应返回错误", async () => {
      mockOrder.findUnique.mockResolvedValue(null);

      const result = await shipOrder("nonexistent", "SF", "SF123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在");
    });

    it("事务内状态变更（并发防护）应阻止非法发货", async () => {
      // 第一次 findUnique 返回 PAID（外层检查通过）
      // 事务内 findUnique 返回 CANCELLED（被并发取消）
      mockOrder.findUnique
        .mockResolvedValueOnce({ id: "order-1", orderNo: "A", status: "PAID" })
        .mockResolvedValueOnce({ status: "CANCELLED" });

      const result = await shipOrder("order-1", "SF", "SF123");

      expect(result.success).toBe(false);
      expect(result.error).toContain("发货失败");
    });
  });

  describe("confirmReceipt - 确认收货", () => {
    it("SHIPPED 订单应成功确认收货 → COMPLETED", async () => {
      mockOrder.findFirst.mockResolvedValue({
        id: "order-1",
        orderNo: "20240101000000123456",
        userId: "user-1",
        status: "SHIPPED",
      });
      mockOrder.update.mockResolvedValue({});

      const result = await confirmReceipt("order-1", "user-1");

      expect(result.success).toBe(true);
      expect(mockOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1" },
          data: expect.objectContaining({
            status: "COMPLETED",
            receivedAt: expect.any(Date),
          }),
        })
      );
    });

    it("PAID 订单不可确认收货（未发货）", async () => {
      mockOrder.findFirst.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        status: "PAID",
      });

      const result = await confirmReceipt("order-1", "user-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("状态不正确");
    });

    it("COMPLETED 订单不可重复确认", async () => {
      mockOrder.findFirst.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        status: "COMPLETED",
      });

      const result = await confirmReceipt("order-1", "user-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("状态不正确");
    });

    it("其他用户的订单不可操作", async () => {
      mockOrder.findFirst.mockResolvedValue(null); // userId 不匹配

      const result = await confirmReceipt("order-1", "other-user");

      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在");
    });
  });

  describe("queryLogistics - 物流查询", () => {
    it("无物流单号应返回 null", async () => {
      mockOrder.findUnique.mockResolvedValue({
        shippingCompany: null,
        trackingNo: null,
        status: "PAID",
        shippedAt: null,
      });

      const result = await queryLogistics("order-1");
      expect(result).toBeNull();
    });

    it("SHIPPED 状态应返回运输中轨迹", async () => {
      const shippedAt = new Date("2024-01-01T10:00:00Z");
      mockOrder.findUnique.mockResolvedValue({
        shippingCompany: "YTO",
        trackingNo: "YT123456",
        status: "SHIPPED",
        shippedAt,
      });

      const result = await queryLogistics("order-1");

      expect(result).not.toBeNull();
      expect(result!.company).toBe("YTO");
      expect(result!.companyName).toBe("圆通速递");
      expect(result!.trackingNo).toBe("YT123456");
      expect(result!.traces.length).toBeGreaterThanOrEqual(1);
      expect(result!.traces.some((t) => t.status === "快件已发出")).toBe(true);
    });

    it("COMPLETED 状态应包含已签收轨迹", async () => {
      mockOrder.findUnique.mockResolvedValue({
        shippingCompany: "ZTO",
        trackingNo: "ZT999",
        status: "COMPLETED",
        shippedAt: new Date("2024-01-01T10:00:00Z"),
      });

      const result = await queryLogistics("order-1");

      expect(result!.traces.some((t) => t.status === "已签收")).toBe(true);
    });
  });

  describe("状态转换合法路径", () => {
    it("合法路径：PAID → SHIPPED → COMPLETED", async () => {
      // PAID → SHIPPED
      mockOrder.findUnique.mockResolvedValue({ id: "o1", orderNo: "A", status: "PAID" });
      const shipResult = await shipOrder("o1", "SF", "SF001");
      expect(shipResult.success).toBe(true);

      // SHIPPED → COMPLETED
      vi.clearAllMocks();
      mockOrder.findFirst.mockResolvedValue({ id: "o1", userId: "u1", status: "SHIPPED" });
      mockOrder.update.mockResolvedValue({});
      const receiptResult = await confirmReceipt("o1", "u1");
      expect(receiptResult.success).toBe(true);
    });

    it("非法路径：PENDING 不可直接 → SHIPPED", async () => {
      mockOrder.findUnique.mockResolvedValue({ id: "o1", orderNo: "A", status: "PENDING" });

      const result = await shipOrder("o1", "SF", "SF001");
      expect(result.success).toBe(false);
    });

    it("非法路径：PAID 不可直接 → COMPLETED（必须先发货）", async () => {
      mockOrder.findFirst.mockResolvedValue({ id: "o1", userId: "u1", status: "PAID" });

      const result = await confirmReceipt("o1", "u1");
      expect(result.success).toBe(false);
    });

    it("非法路径：COMPLETED 不可回退 → SHIPPED", async () => {
      mockOrder.findUnique.mockResolvedValue({ id: "o1", orderNo: "A", status: "COMPLETED" });

      const result = await shipOrder("o1", "SF", "SF001");
      expect(result.success).toBe(false);
    });
  });
});
