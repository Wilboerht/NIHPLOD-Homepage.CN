/**
 * 管理端权限模型单元测试
 *
 * 覆盖：
 * - 角色模板：owner 全量 / admin 保持旧行为 / ops/support/hr/finance 边界
 * - 个人覆盖：追加授权、撤销（!前缀）、owner 忽略覆盖、未知角色回退 admin
 * - sanitizePermissionOverrides：过滤未知权限、去重
 * - buildPermissionOverrides：勾选状态与覆盖差异互转
 */
import { describe, it, expect } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ROLE_TEMPLATES,
  buildPermissionOverrides,
  canDelegateRoleAndOverrides,
  hasAdminPermission,
  resolveAdminPermissions,
  sanitizePermissionOverrides,
} from "@/lib/admin-permissions";

describe("角色模板", () => {
  it("owner 恒为全部权限且忽略覆盖", () => {
    const all = resolveAdminPermissions("owner", ["!users:read"]);
    expect(all).toHaveLength(ADMIN_PERMISSIONS.length);
    expect(hasAdminPermission({ role: "owner", permissions: ["!users:read"] }, "users:read")).toBe(
      true
    );
  });

  it("admin 模板保持历史行为（无 SSO/管理员管理/资金导入/用户写）", () => {
    const admin = resolveAdminPermissions("admin");
    expect(admin).toContain("products:write");
    expect(admin).toContain("applications:delete");
    expect(admin).toContain("spent:review");
    expect(admin).not.toContain("spent:import");
    expect(admin).not.toContain("sso:read");
    expect(admin).not.toContain("admins:write");
    expect(admin).not.toContain("users:write");
    expect(admin).not.toContain("users:security:write");
    expect(admin).not.toContain("products:batch-delete");
  });

  it("命名角色边界：ops 有礼品/审核无 SSO；support 有手机号查看无写用户；hr 仅招聘；finance 只读", () => {
    const ops = resolveAdminPermissions("ops");
    expect(ops).toContain("gifts:write");
    expect(ops).toContain("spent:review");
    expect(ops).not.toContain("sso:read");
    expect(ops).not.toContain("users:write");

    const support = resolveAdminPermissions("support");
    expect(support).toContain("users:sensitive:read");
    expect(support).toContain("redemptions:fulfill");
    expect(support).not.toContain("users:write");
    expect(support).not.toContain("products:write");

    const hr = resolveAdminPermissions("hr");
    expect(hr).toContain("applications:write");
    expect(hr).not.toContain("products:read");
    expect(hr).not.toContain("users:read");

    const finance = resolveAdminPermissions("finance");
    expect(finance).toContain("audit:read");
    expect(finance).toContain("spent:read");
    expect(finance).not.toContain("spent:review");
    expect(finance).not.toContain("users:write");
  });

  it("未知角色回退 admin 模板", () => {
    expect(resolveAdminPermissions("unknown-role")).toEqual(
      resolveAdminPermissions("admin")
    );
  });
});

describe("个人权限覆盖", () => {
  it("追加授权生效", () => {
    expect(
      hasAdminPermission(
        { role: "support", permissions: ["spent:review"] },
        "spent:review"
      )
    ).toBe(true);
  });

  it("撤销覆盖模板授权", () => {
    expect(
      hasAdminPermission({ role: "ops", permissions: ["!gifts:write"] }, "gifts:write")
    ).toBe(false);
    expect(resolveAdminPermissions("ops", ["!gifts:write"])).not.toContain("gifts:write");
  });

  it("API 层字段 permissionOverrides 的撤销/追加必须生效（回归）", () => {
    // API 的 verifyAuth 返回 permissionOverrides（原始覆盖条目）
    expect(
      hasAdminPermission(
        { role: "ops", permissionOverrides: ["!gifts:write"] },
        "gifts:write"
      )
    ).toBe(false);
    expect(
      hasAdminPermission(
        { role: "support", permissionOverrides: ["spent:review"] },
        "spent:review"
      )
    ).toBe(true);
    // 同时存在 permissions 与 permissionOverrides 时以覆盖为准
    expect(
      hasAdminPermission(
        {
          role: "ops",
          permissions: ["gifts:write"],
          permissionOverrides: ["!gifts:write"],
        },
        "gifts:write"
      )
    ).toBe(false);
  });

  it("sanitize 过滤未知权限与去重", () => {
    expect(
      sanitizePermissionOverrides(["users:read", "not:exist", "!products:write", "users:read"])
    ).toEqual(["users:read", "!products:write"]);
    expect(sanitizePermissionOverrides(null)).toEqual([]);
  });
});

describe("buildPermissionOverrides 与模板互转", () => {
  it("未改动模板时偏移为空", () => {
    const role = "ops" as const;
    const selected = [...ROLE_TEMPLATES[role]];
    expect(buildPermissionOverrides(role, selected)).toEqual([]);
  });

  it("勾选模板外权限生成追加；取消模板内权限生成撤销", () => {
    const role = "support" as const;
    const selected = ROLE_TEMPLATES[role].filter((p) => p !== "messages:write");
    const overrides = buildPermissionOverrides(role, [...selected, "users:write"]);
    expect(overrides).toContain("!messages:write");
    expect(overrides).toContain("users:write");
  });

  it("往返一致：生成覆盖后解析结果等于勾选集合", () => {
    const role = "hr" as const;
    const selected = [...ROLE_TEMPLATES[role], "audit:read"].filter(
      (p) => p !== "jobs:delete"
    );
    const overrides = buildPermissionOverrides(role, selected);
    const resolved = resolveAdminPermissions(role, overrides);
    expect(new Set(resolved)).toEqual(new Set(selected));
  });

  it("owner 不生成覆盖", () => {
    expect(buildPermissionOverrides("owner", ["users:read"])).toEqual([]);
  });
});

describe("canDelegateRoleAndOverrides 委派边界", () => {
  const delegatedOps = { role: "ops", permissionOverrides: ["admins:write"] };

  it("owner 不受限制", () => {
    expect(canDelegateRoleAndOverrides({ role: "owner" }, "admin", ["sso:read"])).toBe(true);
  });

  it("目标角色模板超出自身权限时拒绝（ops 委派 support）", () => {
    expect(canDelegateRoleAndOverrides(delegatedOps, "support", [])).toBe(false);
  });

  it("追加授权超出自身权限时拒绝（ops 授予 sso:read）", () => {
    expect(canDelegateRoleAndOverrides(delegatedOps, "ops", ["sso:read"])).toBe(false);
  });

  it("同范围角色与撤销条目允许", () => {
    expect(canDelegateRoleAndOverrides(delegatedOps, "ops", ["!products:write"])).toBe(true);
  });
});
