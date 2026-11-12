import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  pointRedemption: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
}));
const pointGiftsMock = vi.hoisted(() => ({
  redeemGiftForUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  apiConsole: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/validation", () => ({
  validateCUID: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/point-gifts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/point-gifts")>();
  return {
    ...original,
    redeemGiftForUser: (...args: unknown[]) => pointGiftsMock.redeemGiftForUser(...args),
  };
});

import {
  getRedemptionDetailResponse,
  getRedemptionsResponse,
  redeemPointsResponse,
} from "@/lib/points-mall-api";

const createdAt = new Date("2026-11-13T04:00:00.000Z");

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "redemption-1",
    productId: "product-1",
    productName: "测试礼品",
    priceYuan: 100,
    points: 100,
    status: "COMPLETED",
    recipient: "张三",
    phone: "13800138000",
    address: "上海市 浦东新区",
    carrier: "SF",
    waybillNo: "SF123",
    fulfilledAt: createdAt,
    completedAt: createdAt,
    cancelledAt: null,
    cancelNote: null,
    afterSalesRequestedAt: null,
    afterSalesReason: null,
    afterSalesReviewNote: null,
    afterSalesApprovedAt: null,
    afterSalesClosedAt: null,
    returnWaybillNo: null,
    returnCarrier: null,
    returnShippedAt: null,
    returnReceivedAt: null,
    refundedPoints: 0,
    refundedAt: null,
    createdAt,
    product: { images: [{ url: "/uploads/product.png" }] },
    ...overrides,
  };
}

describe("redemption response contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns productId and image in list", async () => {
    prismaMock.pointRedemption.findMany.mockResolvedValue([listRow()]);
    prismaMock.pointRedemption.count.mockResolvedValue(1);

    const res = await getRedemptionsResponse(
      "user-1",
      new Request("http://localhost/api/oauth/points/redemptions?offset=0")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.redemptions[0].productId).toBe("product-1");
    expect(body.data.redemptions[0].image).toBe("/uploads/product.png");
    expect(body.data.redemptions[0].status).toBe("COMPLETED");
  });

  it("maps ACCOUNT_DISABLED to 403 on redeem", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ membershipLevel: "GOLD" });
    pointGiftsMock.redeemGiftForUser.mockResolvedValue({
      ok: false,
      code: "ACCOUNT_DISABLED",
      message: "账号已被禁用",
    });

    const res = await redeemPointsResponse(
      "user-1",
      new Request("http://localhost/api/oauth/points/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: "product-1",
          addressId: "address-1",
          requestId: "request-1",
        }),
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("returns productId/image and events in detail, without leaking product relation", async () => {
    prismaMock.pointRedemption.findUnique.mockResolvedValue({
      ...listRow(),
      userId: "user-1",
      afterSalesImages: [],
      afterSalesReviewedAt: null,
      inspectionNote: null,
      events: [
        {
          id: "event-1",
          fromStatus: "FULFILLED",
          toStatus: "COMPLETED",
          actorType: "SYSTEM",
          reasonCode: null,
          reasonText: null,
          metadata: null,
          createdAt,
        },
      ],
    });

    const res = await getRedemptionDetailResponse("user-1", "redemption-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.productId).toBe("product-1");
    expect(body.data.image).toBe("/uploads/product.png");
    expect(body.data.events).toHaveLength(1);
    expect(body.data.product).toBeUndefined();
  });
});
