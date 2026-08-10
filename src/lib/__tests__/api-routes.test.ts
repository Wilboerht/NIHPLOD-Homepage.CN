/**
 * API 路由集成测试
 * 直接调用 route handler，验证请求/响应契约
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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

  const prisma = {
    order: createMockModel(),
    product: createMockModel(),
    address: createMockModel(),
    cartItem: createMockModel(),
    userCoupon: createMockModel(),
    setting: createMockModel(),
    transaction: createMockModel(),
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  };

  return { prisma };
});

// Mock auth
const mockVerifyUserAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  verifyUserAuth: (...args: unknown[]) => mockVerifyUserAuth(...args),
  verifyAdminAuth: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  logError: vi.fn(),
}));

// Mock ratelimit
vi.mock("@/lib/ratelimit", () => ({
  dualRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock shipping-config
vi.mock("@/lib/shipping-config", () => ({
  calculateShippingFee: vi.fn().mockResolvedValue(0),
}));

// Mock CSRF
vi.mock("@/lib/csrf", () => ({
  validateCSRFToken: vi.fn().mockReturnValue(true),
  csrfForbiddenResponse: () => {
    return NextResponse.json(
      { success: false, error: { code: "CSRF_ERROR", message: "CSRF 验证失败" } },
      { status: 403 }
    );
  },
}));

// Mock order service
const mockCreateOrder = vi.fn();
vi.mock("@/lib/order", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
}));

// Mock validation
vi.mock("@/lib/validation", () => ({
  validateCUID: (id: string) => id.length > 0 && id.length <= 30,
  invalidIdResponse: () => {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_ID", message: "无效ID" } },
      { status: 400 }
    );
  },
}));

import { prisma } from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  order: Record<string, ReturnType<typeof vi.fn>>;
  product: Record<string, ReturnType<typeof vi.fn>>;
  address: Record<string, ReturnType<typeof vi.fn>>;
  cartItem: Record<string, ReturnType<typeof vi.fn>>;
  userCoupon: Record<string, ReturnType<typeof vi.fn>>;
};

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), options as never);
}

describe("API 路由集成测试", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/orders", () => {
    it("未登录应返回 401", async () => {
      mockVerifyUserAuth.mockResolvedValue(null);
      const { GET } = await import("@/app/api/orders/route");

      const req = createRequest("/api/orders");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("已登录应返回订单列表", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: "order-1",
          orderNo: "20240101000000123456",
          status: "PAID",
          totalAmount: 100,
          payAmount: 100,
          items: [],
        },
      ]);
      mockPrisma.order.count.mockResolvedValue(1);

      const { GET } = await import("@/app/api/orders/route");
      const req = createRequest("/api/orders");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.orders).toHaveLength(1);
      expect(data.data.orders[0].orderNo).toBe("20240101000000123456");
    });

    it("按状态筛选应传递正确的 where 条件", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      const { GET } = await import("@/app/api/orders/route");
      const req = createRequest("/api/orders?status=SHIPPED");
      await GET(req);

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "SHIPPED",
          }),
        })
      );
    });
  });

  describe("POST /api/orders", () => {
    it("未登录应返回 401", async () => {
      mockVerifyUserAuth.mockResolvedValue(null);
      const { POST } = await import("@/app/api/orders/route");

      const req = createRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({ items: [{ productId: "p1", quantity: 1 }], addressId: "a1" }),
      });
      const res = await POST(req);

      expect(res.status).toBe(401);
    });

    it("缺少必填字段应返回 400", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      const { POST } = await import("@/app/api/orders/route");

      // 缺少 items
      const req = createRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({ addressId: "addr-1" }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("商品重复应返回 400", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      const { POST } = await import("@/app/api/orders/route");

      const req = createRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          addressId: "addr-1",
          items: [
            { productId: "prod-1", quantity: 1 },
            { productId: "prod-1", quantity: 2 },
          ],
        }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it("有效请求应调用 createOrder 并返回成功", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      mockCreateOrder.mockResolvedValue({
        success: true,
        orderId: "order-1",
        orderNo: "20240101000000123456",
      });

      const { POST } = await import("@/app/api/orders/route");
      const req = createRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          addressId: "addr-1",
          items: [{ productId: "prod-1", quantity: 2 }],
          remark: "请尽快发货",
        }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.orderId).toBe("order-1");
      expect(mockCreateOrder).toHaveBeenCalledWith(
        "user-1",
        [{ productId: "prod-1", quantity: 2 }],
        expect.objectContaining({ addressId: "addr-1" }),
        "请尽快发货",
        undefined,
        undefined
      );
    });

    it("createOrder 失败应返回错误信息", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      mockCreateOrder.mockResolvedValue({
        success: false,
        error: "商品库存不足",
      });

      const { POST } = await import("@/app/api/orders/route");
      const req = createRequest("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          addressId: "addr-1",
          items: [{ productId: "prod-1", quantity: 99 }],
        }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(false);
      expect(data.error.message).toContain("库存不足");
    });
  });

  describe("GET /api/checkout/data", () => {
    it("未登录应返回 401", async () => {
      mockVerifyUserAuth.mockResolvedValue(null);
      const { GET } = await import("@/app/api/checkout/data/route");

      const req = createRequest("/api/checkout/data");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });

    it("购物车为空应返回 400", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      mockPrisma.cartItem.findMany.mockResolvedValue([]);

      const { GET } = await import("@/app/api/checkout/data/route");
      const req = createRequest("/api/checkout/data");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("EMPTY_CART");
    });

    it("直接购买模式：库存不足应返回 400", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: "prod-1",
          name: "商品A",
          price: 100,
          stock: 2,
          published: true,
          allowDirectBuy: true,
          images: [],
        },
      ]);

      const { GET } = await import("@/app/api/checkout/data/route");
      const req = createRequest("/api/checkout/data?productIds=prod-1&quantities=5");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("INSUFFICIENT_STOCK");
    });

    it("直接购买模式：正常返回结算数据", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });
      mockPrisma.product.findMany
        .mockResolvedValueOnce([
          {
            id: "prod-1",
            name: "商品A",
            price: 299,
            stock: 10,
            published: true,
            allowDirectBuy: true,
            images: [{ url: "/img.jpg" }],
          },
        ])
        .mockResolvedValueOnce([{ id: "prod-1", categoryId: "cat-1" }]);
      mockPrisma.address.findMany.mockResolvedValue([
        {
          id: "addr-1",
          name: "张三",
          phone: "138",
          province: "北京",
          city: "北京",
          district: "朝阳",
          detail: "路1号",
          isDefault: true,
        },
      ]);
      mockPrisma.userCoupon.findMany.mockResolvedValue([]);

      const { GET } = await import("@/app/api/checkout/data/route");
      const req = createRequest("/api/checkout/data?productIds=prod-1&quantities=2");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items[0].productName).toBe("商品A");
      expect(data.data.items[0].quantity).toBe(2);
      expect(data.data.totalPrice).toBe(598);
      expect(data.data.shippingFee).toBe(0);
      expect(data.data.finalTotal).toBe(598);
    });

    it("数量超过99应返回 400", async () => {
      mockVerifyUserAuth.mockResolvedValue({ id: "user-1", role: "user" });

      const { GET } = await import("@/app/api/checkout/data/route");
      const req = createRequest("/api/checkout/data?productIds=prod-1&quantities=100");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error.code).toBe("INVALID_QUANTITY");
    });
  });
});
