import { describe, expect, it } from "vitest";
import {
  APPROVAL_POLICIES,
  APPROVAL_POLICY_KEYS,
  getApprovalPolicy,
  isApprovalPolicyKey,
  isPointsAdjustApprovalRequired,
  isRedemptionCancelApprovalRequired,
  isSpentReviewApprovalRequired,
} from "@/lib/admin-approval-policy";

describe("admin approval policy", () => {
  it("registers all policy keys", () => {
    for (const key of APPROVAL_POLICY_KEYS) {
      expect(APPROVAL_POLICIES[key].key).toBe(key);
      expect(APPROVAL_POLICIES[key].label).toBeTruthy();
    }
  });

  it("validates policy keys", () => {
    expect(isApprovalPolicyKey("points.adjust")).toBe(true);
    expect(isApprovalPolicyKey("unknown")).toBe(false);
    expect(getApprovalPolicy("unknown")).toBeNull();
  });

  it("applies points adjustment threshold", () => {
    expect(isPointsAdjustApprovalRequired(999)).toBe(false);
    expect(isPointsAdjustApprovalRequired(1000)).toBe(true);
    expect(isPointsAdjustApprovalRequired(-1000)).toBe(true);
  });

  it("applies redemption cancel threshold", () => {
    expect(isRedemptionCancelApprovalRequired(999)).toBe(false);
    expect(isRedemptionCancelApprovalRequired(1000)).toBe(true);
  });

  it("applies spent review threshold", () => {
    expect(isSpentReviewApprovalRequired(4999)).toBe(false);
    expect(isSpentReviewApprovalRequired(5000)).toBe(true);
  });

  it("marks TOTP recovery as owner auto execution and admin-plane permission", () => {
    expect(APPROVAL_POLICIES["totp.recovery.issue"].executionMode).toBe("AUTO");
    expect(APPROVAL_POLICIES["totp.recovery.issue"].requestPermission).toBe("admins:write");
    expect(APPROVAL_POLICIES["admin.delete"].requestPermission).toBe("admins:write");
  });
});
