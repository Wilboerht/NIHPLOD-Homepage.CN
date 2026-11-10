import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestAfterSales } = vi.hoisted(() => ({ requestAfterSales: vi.fn() }));
vi.mock("@/lib/redemption-state-machine", () => ({
  requestAfterSales,
  confirmRedemption: vi.fn(),
  getRedemptionTimeline: vi.fn(),
  submitReturnShipment: vi.fn(),
}));

vi.mock("@/lib/admin-notify", () => ({ notifyNewRedemption: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { requestAfterSalesResponse } from "../points-mall-api";

const redemptionId = "ckz7q4g5v0000qz8x8f0d4h6a";
const ownImage = "private-local:spent-adjustments/user-1/123e4567-e89b-42d3-a456-426614174000.webp";

function request(images: string[]): Request {
  return new Request("http://localhost/api/user/points/redemptions/after-sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: "request-1", reason: "商品破损", images }),
  });
}

describe("兑换售后凭证归属", () => {
  beforeEach(() => requestAfterSales.mockReset());

  it("接受当前用户已上传的私有凭证", async () => {
    requestAfterSales.mockResolvedValue({ ok: true, status: "AFTER_SALES_REQUESTED" });

    const response = await requestAfterSalesResponse("user-1", redemptionId, request([ownImage]));

    expect(response.status).toBe(200);
    expect(requestAfterSales).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", images: [ownImage] })
    );
  });

  it("拒绝其他用户的私有凭证或公开外链", async () => {
    const otherImage = ownImage.replace("user-1", "user-2");
    for (const image of [otherImage, "https://example.com/proof.jpg"]) {
      const response = await requestAfterSalesResponse("user-1", redemptionId, request([image]));
      expect(response.status).toBe(400);
    }
    expect(requestAfterSales).not.toHaveBeenCalled();
  });
});
