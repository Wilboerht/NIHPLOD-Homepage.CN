import { describe, expect, it } from "vitest";
import {
  CUSTOM_ADMIN_LABEL,
  getAdminRoleDisplay,
  getAdminRoleLabel,
  getPermissionDiff,
  isCustomizedAdmin,
} from "@/lib/admin-display";
import { resolveAdminPermissions } from "@/lib/admin-permissions";

describe("admin-display", () => {
  it("owner 显示超管，即使有覆盖也不显示自定义管理", () => {
    expect(getAdminRoleDisplay("owner", ["admins:write"])).toMatchObject({
      label: "超管",
      variant: "primary",
    });
    expect(isCustomizedAdmin("owner", ["admins:write"])).toBe(false);
    expect(getAdminRoleLabel("owner", true)).toBe("超管");
  });

  it("非 owner 有覆盖时统一显示自定义管理，并带基础角色与差异", () => {
    const display = getAdminRoleDisplay("ops", ["admins:write", "!dashboard:read"]);
    expect(display.label).toBe(CUSTOM_ADMIN_LABEL);
    expect(display.variant).toBe("secondary");
    expect(display.title).toContain("运营");
    expect(display.title).toContain("+1");
    expect(display.title).toContain("-1");
    expect(display.srSuffix).toContain("运营");
  });

  it("无覆盖时显示基础角色标签", () => {
    expect(getAdminRoleDisplay("admin", [])).toMatchObject({
      label: "管理员",
      variant: "default",
    });
    expect(getAdminRoleLabel("ops", false)).toBe("运营");
  });

  it("getPermissionDiff 正确计算新增与撤销", () => {
    const effective = resolveAdminPermissions("ops", ["admins:write", "!dashboard:read"]);
    const diff = getPermissionDiff("ops", effective);
    expect(diff.added).toContain("admins:write");
    expect(diff.removed).toContain("dashboard:read");
    expect(diff.addedCount).toBeGreaterThan(0);
    expect(diff.removedCount).toBeGreaterThan(0);
  });
});
