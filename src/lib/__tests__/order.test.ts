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
    deleteMany: vi.fn(),
    count: vi.fn(),
  });

  const tx = {
    order: createMockModel(),
    orderItem: createMockModel(),
    product: createMockModel(),
    userCoupon: createMockModel(),
    address: createMockModel(),
    cartItem: createMockModel(),
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return { prisma };
});

// Mock shipping-config
vi.mock("@/lib/shipping-config", () => ({
  calculateShippingFee: vi.fn().mockResolvedValue(0),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock random
vi.mock("@/lib/random", () => ({
  randomInt: vi.fn(() => 123456),
}));

import { prisma } from "@/lib/prisma";
import { calculateShippingFee } from "@/lib/shipping-config";
import {
  createOrder,
  cancelOrder,
  autoCancelExpiredOrders,
  autoCompleteShippedOrders,
  generateOrderNo,
} from "@/lib/order";

const mockPrisma = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>;
  order: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  product: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  userCoupon: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  address: { findFirst: ReturnType<typeof vi.fn> };
  cartItem: { deleteMany: ReturnType<typeof vi.fn> };
};

const mockShippingFee = calculateShippingFee as ReturnType<typeof vi.fn>;

function makeProduct(overrides = {}) {
  return {
    id: "prod-1",
    name: "测试商品",
    price: 100,
    stock: 10,
    published: true,
    allowDirectBuy: true,
    images: [{ url: "/img.jpg" }],
    ...overrides,
  };
}

describe("订单服务", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShippingFee.mockResolvedValue(0);
  });

  describe("generateOrderNo", () => {
    it("应生成20位订单号（14位日期+6位随机数）", () => {
      const orderNo = generateOrderNo();
      expect(orderNo).toHaveLength(20);
      expect(orderNo).toMatch(/^\d{20}$/);
    });
  });

  describe("createOrder", () => {
    it("应成功创建订单并扣减库存", async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.create.mockResolvedValue({ id: "order-1", orderNo: "20240101000000123456" });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      const result = await createOrder("user-1", [{ productId: "prod-1", quantity: 2 }], {
        recipient: { name: "张三", phone: "13800138000", address: "北京市" },
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBe("order-1");
      // 验证库存原子扣减
      expect(mockPrisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-1", stock: { gte: 2 } },
          data: { stock: { decrement: 2 } },
        })
      );
    });

    it("库存不足时应拒绝创建", async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct({ stock: 1 })]);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 0 }); // 扣减失败

      const result = await createOrder("user-1", [{ productId: "prod-1", quantity: 5 }], {
        recipient: { name: "张三", phone: "13800138000", address: "北京市" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("库存不足");
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it("商品不存在或已下架时应拒绝", async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      const result = await createOrder("user-1", [{ productId: "prod-999", quantity: 1 }], {
        recipient: { name: "张三", phone: "13800138000", address: "北京市" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("不存在或已下架");
    });

    it("不支持站内购买的商品应拒绝", async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct({ allowDirectBuy: false })]);

      const result = await createOrder("user-1", [{ productId: "prod-1", quantity: 1 }], {
        recipient: { name: "张三", phone: "13800138000", address: "北京市" },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("不支持站内购买");
    });

    it("优惠券并发锁定（CAS）失败时应拒绝", async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.userCoupon.findFirst.mockResolvedValue({
        id: "uc-1",
        userId: "user-1",
        status: "UNUSED",
        coupon: {
          type: "DISCOUNT_AMOUNT",
          value: 10,
          minAmount: 50,
          scopeType: "ALL",
          scopeIds: [],
        },
      });
      // CAS 锁定失败：已被其他请求锁定
      mockPrisma.userCoupon.updateMany.mockResolvedValue({ count: 0 });

      const result = await createOrder(
        "user-1",
        [{ productId: "prod-1", quantity: 1 }],
        { recipient: { name: "张三", phone: "13800138000", address: "北京市" } },
        undefined,
        "uc-1"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("优惠券已被使用或锁定");
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it("运费应纳入 payAmount 计算", async () => {
      mockShippingFee.mockResolvedValue(15); // 运费15元
      mockPrisma.product.findMany.mockResolvedValue([makeProduct({ price: 100 })]);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.create.mockResolvedValue({ id: "order-1", orderNo: "20240101000000123456" });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await createOrder("user-1", [{ productId: "prod-1", quantity: 1 }], {
        recipient: { name: "张三", phone: "13800138000", address: "北京市" },
      });

      // payAmount = totalAmount(100) + shippingFee(15) - discount(0) = 115
      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 100,
            shippingFee: 15,
            payAmount: 115,
          }),
        })
      );
    });

    it("满减优惠券应正确计算折扣后 payAmount", async () => {
      mockShippingFee.mockResolvedValue(10);
      mockPrisma.product.findMany.mockResolvedValue([makeProduct({ price: 200 })]);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.userCoupon.findFirst.mockResolvedValue({
        id: "uc-1",
        userId: "user-1",
        status: "UNUSED",
        coupon: {
          type: "DISCOUNT_AMOUNT",
          value: 30,
          minAmount: 100,
          scopeType: "ALL",
          scopeIds: [],
        },
      });
      mockPrisma.userCoupon.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.create.mockResolvedValue({ id: "order-1", orderNo: "20240101000000123456" });
      mockPrisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

      await createOrder(
        "user-1",
        [{ productId: "prod-1", quantity: 1 }],
        { recipient: { name: "张三", phone: "13800138000", address: "北京市" } },
        undefined,
        "uc-1"
      );

      // payAmount = 200 + 10 - 30 = 180
      expect(mockPrisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 200,
            shippingFee: 10,
            discountAmount: 30,
            payAmount: 180,
          }),
        })
      );
    });

    it("优惠券金额超过订单总额时应拒绝（零元购防护）", async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct({ price: 20 })]);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.userCoupon.findFirst.mockResolvedValue({
        id: "uc-1",
        userId: "user-1",
        status: "UNUSED",
        coupon: {
          type: "DISCOUNT_AMOUNT",
          value: 50, // 优惠50 > 订单20
          minAmount: 0,
          scopeType: "ALL",
          scopeIds: [],
        },
      });

      const result = await createOrder(
        "user-1",
        [{ productId: "prod-1", quantity: 1 }],
        { recipient: { name: "张三", phone: "13800138000", address: "北京市" } },
        undefined,
        "uc-1"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("优惠券金额异常");
    });

    it("direct_buy 来源不应清理购物车", async () => {
      mockPrisma.product.findMany.mockResolvedValue([makeProduct()]);
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.create.mockResolvedValue({ id: "order-1", orderNo: "20240101000000123456" });

      await createOrder(
        "user-1",
        [{ productId: "prod-1", quantity: 1 }],
        { recipient: { name: "张三", phone: "13800138000", address: "北京市" } },
        undefined,
        undefined,
        "direct_buy"
      );

      expect(mockPrisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("cancelOrder", () => {
    it("PENDING 订单应成功取消并恢复库存", async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        status: "PENDING",
        items: [{ productId: "prod-1", quantity: 2 }],
        userCoupon: null,
      });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.product.update.mockResolvedValue({});

      const result = await cancelOrder("order-1", "user-1");

      expect(result.success).toBe(true);
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1", status: { in: ["PENDING", "PAYING"] } },
          data: { status: "CANCELLED" },
        })
      );
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-1" },
          data: { stock: { increment: 2 } },
        })
      );
    });

    it("PAYING 订单也可取消", async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        status: "PAYING",
        items: [{ productId: "prod-1", quantity: 1 }],
        userCoupon: null,
      });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.product.update.mockResolvedValue({});

      const result = await cancelOrder("order-1", "user-1");
      expect(result.success).toBe(true);
    });

    it("PAID 订单不可取消", async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        status: "PAID",
        items: [],
        userCoupon: null,
      });

      const result = await cancelOrder("order-1", "user-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("不可取消");
    });

    it("取消时应释放已锁定的优惠券", async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        status: "PENDING",
        items: [{ productId: "prod-1", quantity: 1 }],
        userCoupon: { id: "uc-1", status: "LOCKED" },
      });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.product.update.mockResolvedValue({});
      mockPrisma.userCoupon.update.mockResolvedValue({});

      const result = await cancelOrder("order-1", "user-1");

      expect(result.success).toBe(true);
      expect(mockPrisma.userCoupon.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "uc-1" },
          data: { status: "UNUSED", usedAt: null, orderId: null },
        })
      );
    });

    it("并发取消（CAS 失败）应返回错误", async () => {
      mockPrisma.order.findFirst.mockResolvedValue({
        id: "order-1",
        userId: "user-1",
        status: "PENDING",
        items: [],
        userCoupon: null,
      });
      mockPrisma.order.updateMany.mockResolvedValue({ count: 0 }); // CAS 失败

      const result = await cancelOrder("order-1", "user-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("并发处理");
    });
  });

  describe("autoCancelExpiredOrders", () => {
    it("应取消超时未支付订单并恢复库存", async () => {
      const expiredOrder = {
        id: "order-1",
        orderNo: "20240101000000123456",
        status: "PENDING",
        adminNote: null,
        createdAt: new Date(Date.now() - 31 * 60 * 1000),
        items: [{ productId: "prod-1", quantity: 1 }],
        userCoupon: null,
      };
      mockPrisma.order.findMany.mockResolvedValue([expiredOrder]);
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.product.update.mockResolvedValue({});

      const result = await autoCancelExpiredOrders(30);

      expect(result.success).toBe(true);
      expect(result.canceledCount).toBe(1);
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "order-1", status: { in: ["PENDING", "PAYING"] } },
          data: expect.objectContaining({ status: "CANCELLED" }),
        })
      );
    });

    it("无超时订单时应返回 canceledCount=0", async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await autoCancelExpiredOrders(30);

      expect(result.success).toBe(true);
      expect(result.canceledCount).toBe(0);
    });

    it("边界：恰好30分钟的订单不应被取消", async () => {
      // findMany 使用 createdAt < expiredTime，恰好等于的不满足 lt 条件
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await autoCancelExpiredOrders(30);
      expect(result.canceledCount).toBe(0);
      // 验证查询条件使用了 lt（严格小于）
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: expect.any(Date) },
          }),
        })
      );
    });

    it("CAS 失败的订单不应恢复库存（静默跳过）", async () => {
      const orders = [
        {
          id: "order-1",
          orderNo: "A",
          status: "PENDING",
          adminNote: null,
          items: [{ productId: "prod-1", quantity: 1 }],
          userCoupon: null,
        },
        {
          id: "order-2",
          orderNo: "B",
          status: "PENDING",
          adminNote: null,
          items: [{ productId: "prod-2", quantity: 2 }],
          userCoupon: null,
        },
      ];
      mockPrisma.order.findMany.mockResolvedValue(orders);
      // 第一个 CAS 失败，第二个成功
      mockPrisma.order.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      mockPrisma.product.update.mockResolvedValue({});

      const result = await autoCancelExpiredOrders(30);

      expect(result.success).toBe(true);
      // CAS 失败的订单不应计入 canceledCount
      expect(result.canceledCount).toBe(1);
      // CAS 失败的订单不应触发库存恢复
      expect(mockPrisma.product.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-2" },
          data: { stock: { increment: 2 } },
        })
      );
    });

    it("超时的 PAYING 订单也应被取消", async () => {
      const payingOrder = {
        id: "order-1",
        orderNo: "20240101000000123456",
        status: "PAYING",
        adminNote: null,
        items: [],
        userCoupon: null,
      };
      mockPrisma.order.findMany.mockResolvedValue([payingOrder]);
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });

      const result = await autoCancelExpiredOrders(30);
      expect(result.canceledCount).toBe(1);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["PENDING", "PAYING"] },
          }),
        })
      );
    });
  });

  describe("autoCompleteShippedOrders", () => {
    it("应自动完成超期的 SHIPPED 和 DELIVERED 订单", async () => {
      mockPrisma.order.updateMany.mockResolvedValue({ count: 3 });

      const result = await autoCompleteShippedOrders(15);

      expect(result.success).toBe(true);
      expect(result.completedCount).toBe(3);
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: ["SHIPPED", "DELIVERED"] },
            shippedAt: { lt: expect.any(Date) },
          },
          data: expect.objectContaining({
            status: "COMPLETED",
            receivedAt: expect.any(Date),
          }),
        })
      );
    });

    it("无超期订单时应返回 completedCount=0", async () => {
      mockPrisma.order.updateMany.mockResolvedValue({ count: 0 });

      const result = await autoCompleteShippedOrders(15);

      expect(result.success).toBe(true);
      expect(result.completedCount).toBe(0);
    });

    it("自定义天数参数应正确计算截止时间", async () => {
      mockPrisma.order.updateMany.mockResolvedValue({ count: 0 });
      const before = Date.now();

      await autoCompleteShippedOrders(7);

      const call = mockPrisma.order.updateMany.mock.calls[0][0];
      const shippedBefore = call.where.shippedAt.lt.getTime();
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      // 允许 1 秒误差
      expect(Math.abs(shippedBefore - (before - expectedMs))).toBeLessThan(1000);
    });
  });
});
