import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_TYPE_LABELS,
} from "@/lib/audit-labels";

describe("audit action/target registry", () => {
  it("every audit action has a Chinese label", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABELS[action], `missing label for ${action}`).toBeTruthy();
    }
  });

  it("every audit target type has a Chinese label", () => {
    for (const targetType of AUDIT_TARGET_TYPES) {
      expect(
        AUDIT_TARGET_TYPE_LABELS[targetType],
        `missing label for ${targetType}`
      ).toBeTruthy();
    }
  });

  it("keeps device force logout filterable", () => {
    expect(AUDIT_ACTIONS).toContain("device_force_logout");
  });
});
