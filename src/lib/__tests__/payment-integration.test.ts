import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// 模拟 prisma 模块，避免连接真实数据库
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
    transaction: createMockModel(),
    paymentNotification: createMockModel(),
    cartItem: createMockModel(),
    user: createMockModel(),
    setting: createMockModel(),
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  return { prisma };
});

// 模拟微信支付 SDK，避免真实请求
vi.mock("wechatpay-axios-plugin", () => {
  const queryGet = vi.fn();
  const mockWxpay = {
    v3: {
      pay: {
        transactions: {
          native: { post: vi.fn() },
          jsapi: { post: vi.fn() },
          h5: { post: vi.fn() },
          outTradeNo: new Proxy({}, { get: () => ({ get: queryGet }) }),
        },
      },
      refund: {
        domestic: {
          refunds: { post: vi.fn() },
        },
      },
      certificates: { get: vi.fn() },
    },
  };

  return {
    Wechatpay: vi.fn(() => mockWxpay),
    Rsa: {
      from: vi.fn((key: string) => key),
      sign: vi.fn(() => "mock-signature"),
      verify: vi.fn(() => true),
      KEY_TYPE_PRIVATE: "private",
      KEY_TYPE_PUBLIC: "public",
    },
    Formatter: {
      timestamp: vi.fn(() => 1234567890),
      nonce: vi.fn(() => "mock-nonce"),
      request: vi.fn((method: string, uri: string) => `${method}\n${uri}`),
      response: vi.fn((timestamp: string, nonce: string, body: string) => `${timestamp}\n${nonce}\n${body}`),
      authorization: vi.fn(() => "MOCK_AUTH"),
      joinedByLineFeed: vi.fn((...pieces: string[]) => pieces.join("\n")),
    },
    Aes: {
      AesGcm: {
        decrypt: vi.fn(() =>
          JSON.stringify({
            out_trade_no: "20240101000000123456",
            transaction_id: "wx123",
            trade_state: "SUCCESS",
            amount: { total: 100 },
          })
        ),
      },
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createBaseOrder(): Record<string, any> {
  return {
    id: "order-1",
    orderNo: "20240101000000123456",
    userId: "user-1",
    status: "PENDING",
    totalAmount: 1,
    shippingFee: 0,
    discountAmount: 0,
    payAmount: 1,
    paymentMethod: "wechat",
    paymentNo: null as string | null,
    paymentTime: null,
    refundNo: null,
    refundAmount: 0,
    refundTime: null,
    refundStatus: null,
    previousStatus: null as string | null,
    adminNote: null,
    remark: null,
    recipientName: "Test",
    recipientPhone: "13800138000",
    recipientAddress: "Test Address",
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    updatedAt: new Date(),
    shippedAt: null,
    receivedAt: null,
    items: [
      {
        id: "item-1",
        orderId: "order-1",
        productId: "prod-1",
        productName: "Test Product",
        productImage: null,
        price: 1,
        quantity: 1,
        subtotal: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };
}

describe("支付链路集成测试", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  let wechatPay: typeof import("@/lib/wechat-pay");
  let paymentQuery: typeof import("@/lib/payment-query");
  let refund: typeof import("@/lib/refund");
  let mockAes: typeof import("wechatpay-axios-plugin")["Aes"];

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // 生成测试用 RSA 密钥对
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: "pkcs1", format: "pem" }) as string;
    const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;

    vi.stubEnv("WECHAT_PAY_MCH_ID", "1234567890");
    vi.stubEnv("WECHAT_PAY_SERIAL_NO", "TEST_SERIAL");
    vi.stubEnv("WECHAT_PAY_KEY_PEM", privatePem);
    vi.stubEnv("WECHAT_PAY_API_V3_KEY", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY", publicPem);
    vi.stubEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID", "PUB_SERIAL");
    vi.stubEnv("WECHAT_PAY_NOTIFY_URL", "https://example.com/notify");
    vi.stubEnv("WECHAT_PAY_REFUND_NOTIFY_URL", "https://example.com/refund-notify");

    mockPrisma = (await import("@/lib/prisma")).prisma;
    wechatPay = await import("@/lib/wechat-pay");
    paymentQuery = await import("@/lib/payment-query");
    refund = await import("@/lib/refund");
    mockAes = (await import("wechatpay-axios-plugin")).Aes;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("微信支付回调", () => {
    it("应将 PENDING 订单更新为 PAID 并记录交易流水", async () => {
      const order = createBaseOrder();
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.product.update.mockResolvedValue({ id: "prod-1", salesCount: 1 });
      mockPrisma.userCoupon.findFirst.mockResolvedValue(null);
      mockPrisma.transaction.create.mockResolvedValue({ id: "trx-1" });

      const rawBody = JSON.stringify({
        id: "notify-1",
        resource: {
          nonce: "nonce",
          ciphertext: "cipher",
          associated_data: "ad",
        },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handlePaymentNotify(headers, rawBody);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe("wx123");
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderNo: order.orderNo, status: { in: ["PENDING", "PAYING"] } },
          data: expect.objectContaining({ status: "PAID", paymentMethod: "wechat", paymentNo: "wx123" }),
        })
      );
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-1" },
          data: { salesCount: { increment: 1 } },
        })
      );
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: "PAYMENT", gateway: "wechat", status: "SUCCESS" }),
        })
      );
    });

    it("重复通知应被幂等忽略", async () => {
      const order = { ...createBaseOrder(), status: "PAID", paymentNo: "wx123" };
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.updateMany.mockResolvedValue({ count: 0 });

      const rawBody = JSON.stringify({
        id: "notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handlePaymentNotify(headers, rawBody);

      expect(result.success).toBe(true);
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("终态订单（CANCELLED）应忽略支付通知", async () => {
      const order = { ...createBaseOrder(), status: "CANCELLED" };
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const rawBody = JSON.stringify({
        id: "notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handlePaymentNotify(headers, rawBody);

      expect(result.success).toBe(true);
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });

    it("终态订单（COMPLETED）应忽略支付通知", async () => {
      const order = { ...createBaseOrder(), status: "COMPLETED" };
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const rawBody = JSON.stringify({
        id: "notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handlePaymentNotify(headers, rawBody);

      expect(result.success).toBe(true);
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
    });

    it("并发 CAS 失败时不应记录交易流水", async () => {
      const order = createBaseOrder();
      mockPrisma.order.findUnique.mockResolvedValue(order);
      // CAS 失败：其他进程已处理
      mockPrisma.order.updateMany.mockResolvedValue({ count: 0 });

      const rawBody = JSON.stringify({
        id: "notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handlePaymentNotify(headers, rawBody);

      expect(result.success).toBe(true);
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it("支付金额不匹配应拒绝处理", async () => {
      const order = createBaseOrder();
      order.payAmount = 999; // 本地 999 元，网关返回 1 元
      mockPrisma.order.findUnique.mockResolvedValue(order);

      const rawBody = JSON.stringify({
        id: "notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handlePaymentNotify(headers, rawBody);

      expect(result.success).toBe(false);
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("微信支付主动查询兜底", () => {
    it("应将网关已支付的 PENDING 订单同步为 PAID", async () => {
      const order = createBaseOrder();
      order.paymentMethod = "wechat";
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.product.update.mockResolvedValue({ id: "prod-1", salesCount: 0 });
      mockPrisma.userCoupon.findFirst.mockResolvedValue(null);
      mockPrisma.transaction.create.mockResolvedValue({ id: "trx-query-1" });

      vi.spyOn(wechatPay, "queryWechatPayment").mockResolvedValue({
        success: true,
        paid: true,
        transactionId: "wx_query_123",
        amount: 100,
      });

      const fulfilled = await paymentQuery.queryAndFulfillOrderPayment(order.id);

      expect(fulfilled).toBe(true);
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: order.id, status: { in: ["PENDING", "PAYING"] } },
          data: expect.objectContaining({ status: "PAID", paymentMethod: "wechat", paymentNo: "wx_query_123" }),
        })
      );
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: "PAYMENT", gateway: "wechat" }),
        })
      );
    });

    it("金额不匹配时不应更新订单", async () => {
      const order = createBaseOrder();
      order.payAmount = 2; // 本地 2 元，网关返回 1 元
      order.paymentMethod = "wechat";
      mockPrisma.order.findUnique.mockResolvedValue(order);

      vi.spyOn(wechatPay, "queryWechatPayment").mockResolvedValue({
        success: true,
        paid: true,
        transactionId: "wx_query_123",
        amount: 100,
      });

      const fulfilled = await paymentQuery.queryAndFulfillOrderPayment(order.id);

      expect(fulfilled).toBe(false);
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("微信支付退款回调", () => {
    it("已退款订单重复通知应幂等返回成功", async () => {
      const order = createBaseOrder();
      order.status = "REFUNDED";
      order.paymentNo = "wx123";
      mockPrisma.order.findUnique.mockResolvedValue(order);

      (mockAes.AesGcm.decrypt as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        JSON.stringify({
          out_trade_no: order.orderNo,
          refund_id: "R123",
          refund_status: "SUCCESS",
          success_time: "2024-01-01T00:00:00Z",
          amount: { refund: 100 },
        })
      );

      const rawBody = JSON.stringify({
        id: "refund-notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handleRefundNotify(headers, rawBody);

      expect(result.success).toBe(true);
      expect(result.message).toBe("订单已退款");
      // 不应再次调用 finalizeRefund 中的更新
      expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });

    it("退款金额超过实付金额应拒绝", async () => {
      const order = createBaseOrder();
      order.status = "PAID";
      order.payAmount = 1; // 实付 1 元
      order.paymentNo = "wx123";
      mockPrisma.order.findUnique.mockResolvedValue(order);

      (mockAes.AesGcm.decrypt as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        JSON.stringify({
          out_trade_no: order.orderNo,
          refund_id: "R999",
          refund_status: "SUCCESS",
          success_time: "2024-01-01T00:00:00Z",
          amount: { refund: 200 }, // 退 2 元 > 实付 1 元
        })
      );

      const rawBody = JSON.stringify({
        id: "refund-notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handleRefundNotify(headers, rawBody);

      expect(result.success).toBe(false);
      expect(result.message).toBe("REFUND_AMOUNT_INVALID");
    });

    it("应将 PAID 订单更新为 REFUNDED 并恢复库存与销量", async () => {
      const order = createBaseOrder();
      order.status = "PAID";
      order.paymentNo = "wx123";
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.update.mockResolvedValue({ ...order, status: "REFUNDED" });
      mockPrisma.product.findMany.mockResolvedValue([{ id: "prod-1", salesCount: 1 }]);
      mockPrisma.product.update.mockResolvedValue({ id: "prod-1", salesCount: 0, stock: 10 });
      mockPrisma.userCoupon.findFirst.mockResolvedValue(null);
      mockPrisma.transaction.create.mockResolvedValue({ id: "trx-refund-1" });

      (mockAes.AesGcm.decrypt as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        JSON.stringify({
          out_trade_no: order.orderNo,
          refund_id: "R123",
          refund_status: "SUCCESS",
          success_time: "2024-01-01T00:00:00Z",
          amount: { refund: 100 },
        })
      );

      const rawBody = JSON.stringify({
        id: "refund-notify-1",
        resource: { nonce: "nonce", ciphertext: "cipher", associated_data: "ad" },
      });
      const headers = {
        "wechatpay-signature": "sig",
        "wechatpay-timestamp": `${Math.floor(Date.now() / 1000)}`,
        "wechatpay-nonce": "nonce",
        "wechatpay-serial": "PUB_SERIAL",
      };

      const result = await wechatPay.handleRefundNotify(headers, rawBody);

      expect(result.success).toBe(true);
      expect(result.refundId).toBe("R123");

      // finalizeRefund 用 id 更新状态；handleRefundNotify 用 orderNo 追加 adminNote
      const statusUpdateCall = mockPrisma.order.update.mock.calls.find(
        (call: unknown[]) => (call[0] as { data?: { status?: string } }).data?.status === "REFUNDED"
      );
      expect(statusUpdateCall).toBeDefined();
      expect(statusUpdateCall![0]).toMatchObject({ where: { id: order.id } });

      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "prod-1" },
          data: expect.objectContaining({ stock: { increment: 1 }, salesCount: { decrement: 1 } }),
        })
      );
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: "REFUND", gateway: "wechat", status: "SUCCESS" }),
        })
      );
    });
  });

  describe("管理员退款审批", () => {
    it("微信支付退款审批应保持 REFUNDING 状态并调用退款接口", async () => {
      const order = createBaseOrder();
      order.status = "REFUNDING";
      order.paymentMethod = "wechat";
      order.previousStatus = "PAID";
      mockPrisma.order.findUnique.mockResolvedValue(order);
      mockPrisma.order.update.mockResolvedValue({ ...order, refundNo: "R202401010000" });

      const plugin = await import("wechatpay-axios-plugin");
      const wxpay = new plugin.Wechatpay({} as never);
      wxpay.v3.refund.domestic.refunds.post = vi.fn().mockResolvedValue({ data: { refund_id: "R123" } });

      const result = await refund.processRefund(order.id, true, "同意退款");

      expect(result.success).toBe(true);
      expect(wxpay.v3.refund.domestic.refunds.post).toHaveBeenCalledWith(
        expect.objectContaining({
          out_trade_no: order.orderNo,
          amount: expect.objectContaining({ refund: 100, total: 100 }),
        })
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: order.id },
          data: expect.objectContaining({ refundNo: expect.any(String), refundAmount: 1 }),
        })
      );
    });
  });

  describe("微信支付平台证书自动下载", () => {
    it("应从 /v3/certificates 下载并缓存平台证书", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            {
              serial_no: "NEW_CERT_SERIAL",
              effective_time: "2024-01-01T00:00:00+08:00",
              expire_time: "2029-01-01T00:00:00+08:00",
              encrypt_certificate: {
                algorithm: "AEAD_AES_256_GCM",
                nonce: "nonce",
                associated_data: "certificate",
                ciphertext: "cipher",
              },
            },
          ],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      (mockAes.AesGcm.decrypt as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest\n-----END PUBLIC KEY-----"
      );

      const result = await wechatPay.downloadWechatPlatformCerts();

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.mch.weixin.qq.com/v3/certificates",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ Authorization: expect.any(String) }),
        })
      );

      // 下载后再次创建 wxpay 实例应能使用新证书
      const plugin = await import("wechatpay-axios-plugin");
      new plugin.Wechatpay({} as never);
      expect(plugin.Wechatpay).toHaveBeenCalled();
    });
  });
});
