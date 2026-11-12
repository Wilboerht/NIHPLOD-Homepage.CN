import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/audit";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_TYPE_LABELS,
  getAuditActionLabel,
} from "@/lib/audit-labels";
import { getAuditActionMeta } from "@/lib/audit-registry";

describe("audit action/target registry", () => {
  it("every audit action has a Chinese label", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABELS[action], `missing label for ${action}`).toBeTruthy();
    }
  });

  it("every audit target type has a Chinese label", () => {
    for (const targetType of AUDIT_TARGET_TYPES) {
      expect(AUDIT_TARGET_TYPE_LABELS[targetType], `missing label for ${targetType}`).toBeTruthy();
    }
  });

  it("keeps device force logout filterable", () => {
    expect(AUDIT_ACTIONS).toContain("device_force_logout");
  });

  it("treats admin creation as a critical action", () => {
    expect(getAuditActionMeta("create_admin").riskLevel).toBe("CRITICAL");
  });

  it("labels historical BA SSO audit actions as BA", () => {
    expect(getAuditActionLabel("admin_sso_token", { clientId: "ba-admin" })).toBe(
      "签发 BA 子站断言"
    );
    expect(getAuditActionLabel("admin_sso_token", { baRole: "super_admin" })).toBe(
      "签发 BA 子站断言"
    );
    expect(getAuditActionLabel("admin_sso_token", { clientId: "advisor-admin" })).toBe(
      "签发测肤子站断言"
    );
  });
});
