import { describe, expect, it } from "vitest";
import {
  getRedemptionFulfillableAt,
  getRedemptionProtectionView,
  REDEMPTION_FULFILL_PROTECTION_DAYS,
} from "@/lib/redemption-protection";

describe("redemption fulfillment protection", () => {
  const createdAt = new Date("2026-11-01T08:00:00.000Z");

  it("从兑换时刻起计算 7 天，而不是按自然日清零", () => {
    expect(REDEMPTION_FULFILL_PROTECTION_DAYS).toBe(7);
    expect(getRedemptionFulfillableAt(createdAt).toISOString()).toBe("2026-11-08T08:00:00.000Z");
  });

  it("截止时刻前为保护期，截止时刻及之后允许履约", () => {
    const deadline = getRedemptionFulfillableAt(createdAt);
    expect(
      getRedemptionProtectionView(createdAt, new Date(deadline.getTime() - 1)).protectionActive
    ).toBe(true);
    expect(getRedemptionProtectionView(createdAt, deadline).protectionActive).toBe(false);
  });
});
