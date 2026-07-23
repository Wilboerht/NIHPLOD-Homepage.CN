import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => {
  const createMockModel = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  });

  const tx = {
    order: createMockModel(),
    product: createMockModel(),
    userCoupon: createMockModel(),
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return { prisma };
});

// Mock wechat-pay
const mockApplyWechatRefund = vi.fn();
vi.mock("@/lib/wechat-pay", () => ({
  applyWechatRefund: (...args: unknown[]) => mockApplyWechatRefund(...args),
  generateRefundNo: (orderNo: string) => `R${orderNo}1234`,
}));

// Mock alipay
const mockRefundAlipayOrder = vi.fn();
vi.mock("@/lib/alipay", () => ({
  refundAlipayOrder: (...args: unknown[]) => mockRefundAlipayOrder(...args),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock transaction
vi.mock("@/lib/transaction", () => ({
  recordTransaction: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { applyRefund, processRefund, cancelRefund, finalizeRefund } from "@/lib/refund";

const mockPrisma = prisma as unknown as {
  order: Record<string, ReturnType<typeof vi.fn>>;
  product: Record<string, ReturnType<typeof vi.fn>>;
  userCoupon: Record<string, ReturnType<typeof vi.fn>>;
  $transaction: ReturnType<typeof vi.fn>;
};

function createOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNo: "20240101000000123456",
    userId: "user-1",
    status: "PAID",
    payAmount: 100,
    paymentMethod: "wechat",
    previousStatus: null,
    adminNote: null,
    remark: null,
    refundNo: null,
    refundStatus: null,
    items: [{ productId: "prod-1", quantity: 2 }],
    ...overrides,
  };
}

describe("退款服务", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyRefund（用户申请退款）", () => {
    it("PAID 订单应成功申请退款", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(createOrder());
      mockPrisma.order.update.mockResolvedValue({});

      const result = await applyRefund("order-1", "user-1", "不想要了");

      expect(result.success).toBe(true);
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1" },
          data: expect.objectContaining({
            status: "REFUNDING",
            previousStatus: "PAID",
          }),
        })
      );
    });

    it("SHIPPED 订单也可申请退款", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(createOrder({ status: "SHIPPED" }));
      mockPrisma.order.update.mockResolvedValue({});

      const result = await applyRefund("order-1", "user-1", "质量问题");
      expect(result.success).toBe(true);
    });

    it("PENDING 订单不可申请退款", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(createOrder({ status: "PENDING" }));

      const result = await applyRefund("order-1", "user-1", "不想要了");
      expect(result.success).toBe(false);
      expect(result.error).toBe("该订单状态不支持退款");
    });

    it("COMPLETED 订单不可申请退款", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(createOrder({ status: "COMPLETED" }));

      const result = await applyRefund("order-1", "user-1", "退款");
      expect(result.success).toBe(false);
    });

    it("订单不存在应返回错误", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      const result = await applyRefund("order-x", "user-1", "退款");
      expect(result.success).toBe(false);
      expect(result.error).toBe("订单不存在");
    });

    it("退款原因中的 HTML 应被转义", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(createOrder());
      mockPrisma.order.update.mockResolvedValue({});

      await applyRefund("order-1", "user-1", '<script>alert("xss")</script>');

      const call = mockPrisma.order.update.mock.calls[0][0];
      expect(call.data.remark).toContain("&lt;script&gt;");
      expect(call.data.remark).not.toContain("<script>");
    });
  });

  describe("processRefund（管理员审批）", () => {
    it("拒绝退款应恢复到 previousStatus", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        createOrder({ status: "REFUNDING", previousStatus: "SHIPPED" })
      );
      mockPrisma.order.update.mockResolvedValue({});

      const result = await processRefund("order-1", false, "不符合退款条件");

      expect(result.success).toBe(true);
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "SHIPPED",
            previousStatus: null,
          }),
        })
      );
    });

    it("拒绝退款无 previousStatus 时应恢复为 PAID", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        createOrder({ status: "REFUNDING", previousStatus: null })
      );
      mockPrisma.order.update.mockResolvedValue({});

      const result = await processRefund("order-1", false);

      expect(result.success).toBe(true);
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PAID" }),
        })
      );
    });

    it("已退款订单不可重复操作（幂等）", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(createOrder({ status: "REFUNDED" }));

      const result = await processRefund("order-1", true);
      expect(result.success).toBe(false);
      expect(result.error).toContain("不可重复操作");
    });

    it("非 REFUNDING 状态不可审批", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(createOrder({ status: "PAID" }));

      const result = await processRefund("order-1", true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("订单状态不正确");
    });

    it("订单不存在应返回错误", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      const result = await processRefund("order-x", true);
      expect(result.success).toBe(false);
      expect(result.error).toBe("订单不存在");
    });

    it("微信退款失败应返回错误", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        createOrder({ status: "REFUNDING", paymentMethod: "wechat" })
      );
      mockApplyWechatRefund.mockResolvedValue({ success: false, error: "余额不足" });

      const result = await processRefund("order-1", true);

      expect(result.success).toBe(false);
      expect(result.error).toContain("微信退款失败");
    });

    it("支付宝退款成功应直接 finalize", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        createOrder({ status: "REFUNDING", paymentMethod: "alipay" })
      );
      mockRefundAlipayOrder.mockResolvedValue({ success: true });
      // finalizeRefund 内部调用
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", salesCount: 5 }]);
      mockPrisma.product.update.mockResolvedValue({});
      mockPrisma.userCoupon.findFirst.mockResolvedValue(null);

      const result = await processRefund("order-1", true, "同意");

      expect(result.success).toBe(true);
      expect(mockRefundAlipayOrder).toHaveBeenCalled();
    });

    it("支付宝退款失败应返回错误", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        createOrder({ status: "REFUNDING", paymentMethod: "alipay" })
      );
      mockRefundAlipayOrder.mockResolvedValue({ success: false, error: "交易不存在" });

      const result = await processRefund("order-1", true);

      expect(result.success).toBe(false);
      expect(result.error).toContain("支付宝退款失败");
    });

    it("其他支付方式应直接 finalize（手动退款）", async () => {
      mockPrisma.order.findUnique.mockResolvedValue(
        createOrder({ status: "REFUNDING", paymentMethod: "cod" })
      );
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", salesCount: 2 }]);
      mockPrisma.product.update.mockResolvedValue({});
      mockPrisma.userCoupon.findFirst.mockResolvedValue(null);

      const result = await processRefund("order-1", true);

      expect(result.success).toBe(true);
      // 应调用 order.update 更新 adminNote
      expect(mockPrisma.order.update).toHaveBeenCalled();
    });
  });

  describe("cancelRefund（用户取消退款申请）", () => {
    it("REFUNDING 订单应成功取消退款", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(
        createOrder({ status: "REFUNDING", previousStatus: "PAID", remark: "[退款申请] 不想要了" })
      );
      mockPrisma.order.update.mockResolvedValue({});

      const result = await cancelRefund("order-1", "user-1");

      expect(result.success).toBe(true);
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PAID",
            previousStatus: null,
          }),
        })
      );
    });

    it("非 REFUNDING 状态不可取消", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(createOrder({ status: "PAID" }));

      const result = await cancelRefund("order-1", "user-1");
      expect(result.success).toBe(false);
      expect(result.error).toBe("订单状态不正确");
    });

    it("订单不存在应返回错误", async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      const result = await cancelRefund("order-x", "user-1");
      expect(result.success).toBe(false);
    });
  });

  describe("finalizeRefund（退款确认）", () => {
    it("已退款订单应幂等返回", async () => {
      // 外层 findUnique (orderPreview)
      mockPrisma.order.findUnique.mockResolvedValue(createOrder({ status: "REFUNDED" }));

      await finalizeRefund("order-1", "R123", 100);

      // 事务内 order.update 不应被调用（幂等跳过）
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it("应恢复库存并释放优惠券", async () => {
      const order = createOrder({ status: "REFUNDING" });
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.update.mockResolvedValue({});
      mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", salesCount: 5 }]);
      mockPrisma.product.update.mockResolvedValue({});
      mockPrisma.userCoupon.findFirst.mockResolvedValue({ id: "uc-1", status: "USED" });
      mockPrisma.userCoupon.update.mockResolvedValue({});

      await finalizeRefund("order-1", "R123", 100);

      // 库存恢复
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-1" },
          data: { stock: { increment: 2 }, salesCount: { decrement: 2 } },
        })
      );
      // 优惠券释放
      expect(mockPrisma.userCoupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "uc-1" },
          data: expect.objectContaining({ status: "UNUSED" }),
        })
      );
    });
  });
});
