import { describe, it, expect } from "vitest";
import {
  ADMIN_PAGE_RULES,
  canAccessAdminPage,
  getAdminPageRule,
  getAdminPageRulePermissions,
} from "@/lib/admin-page-permissions";
import { adminNavItems } from "@/config/admin-nav";

function admin(role: string, permissionOverrides: string[] = []) {
  return { role, permissionOverrides };
}

describe("管理端页面权限映射", () => {
  it("基础页面按对应读取权限匹配", () => {
    const cases: [string, string][] = [
      ["/admin", "dashboard:read"],
      ["/admin/users", "users:read"],
      ["/admin/account-deletions", "users:read"],
      ["/admin/admins", "admins:read"],
      ["/admin/applications", "applications:read"],
      ["/admin/audit-integrity", "audit:read"],
      ["/admin/audit-logs", "audit:read"],
      ["/admin/audit-retention", "audit:retention:read"],
      ["/admin/categories", "categories:read"],
      ["/admin/cron-tasks", "cron:read"],
      ["/admin/jobs", "jobs:read"],
      ["/admin/messages", "messages:read"],
      ["/admin/oauth/audit", "sso:read"],
      ["/admin/oauth/consents", "sso:read"],
      ["/admin/oauth/sessions", "sso:read"],
      ["/admin/oauth/stats", "sso:read"],
      ["/admin/oauth-clients", "sso:clients:read"],
      ["/admin/products", "products:read"],
      ["/admin/webhook-failures", "webhooks:read"],
    ];

    for (const [pathname, permission] of cases) {
      const rule = getAdminPageRule(pathname);
      expect(rule, `${pathname} 缺少页面权限规则`).toBeTruthy();
      expect(rule?.allOf).toContain(permission);
    }
  });

  it("动态编辑页优先匹配写权限规则，且包含实际数据读取所需权限", () => {
    expect(getAdminPageRulePermissions(getAdminPageRule("/admin/products/new")!)).toEqual([
      "products:write",
      "categories:read",
    ]);
    expect(getAdminPageRulePermissions(getAdminPageRule("/admin/products/prod-1/edit")!)).toEqual([
      "products:write",
      "products:read",
      "categories:read",
    ]);
    expect(getAdminPageRule("/admin/jobs/new")?.allOf).toEqual(["jobs:write"]);
    expect(getAdminPageRule("/admin/jobs/job-1/edit")?.allOf).toEqual(["jobs:write", "jobs:read"]);
    expect(getAdminPageRule("/admin/oauth-clients/wizard")?.allOf).toEqual([
      "sso:clients:write",
      "sso:clients:read",
    ]);
  });

  it("多权限页面使用 anyOf", () => {
    for (const pathname of [
      "/admin/approvals",
      "/admin/point-gifts",
      "/admin/spent-adjustments",
      "/admin/subsites/advisor",
    ]) {
      expect(getAdminPageRule(pathname)?.anyOf, `${pathname} 应使用 anyOf`).toBeTruthy();
    }
  });

  it("自服务/无业务数据页面登录后即可访问", () => {
    expect(canAccessAdminPage(admin("hr"), "/admin/settings/totp")).toBe(true);
    expect(canAccessAdminPage(admin("hr"), "/admin/sso/denied")).toBe(true);
    expect(canAccessAdminPage(admin("hr"), "/admin/sso-audit")).toBe(true);
  });

  it("兼容尾部斜杠，避免 /admin/ 等合法入口被误判为未知路径", () => {
    expect(getAdminPageRule("/admin/")).toEqual(getAdminPageRule("/admin"));
    expect(getAdminPageRule("/admin/settings/totp/")).toEqual(
      getAdminPageRule("/admin/settings/totp")
    );
    expect(getAdminPageRule("/admin/jobs/new/")).toEqual(getAdminPageRule("/admin/jobs/new"));
    expect(canAccessAdminPage(admin("finance"), "/admin/audit-retention/")).toBe(true);
  });

  it("未知路径默认拒绝（fail-closed），未注册子路径不继承父级权限", () => {
    expect(getAdminPageRule("/admin/unknown")).toBeNull();
    expect(canAccessAdminPage(admin("owner"), "/admin/unknown")).toBe(false);
    expect(canAccessAdminPage(admin("owner"), "/admin/users-extra")).toBe(false);
    expect(getAdminPageRule("/admin/users/export")).toBeNull();
    expect(getAdminPageRule("/admin/audit-logs/export")).toBeNull();
    expect(getAdminPageRule("/admin/oauth-clients/abc")).toBeNull();
    expect(getAdminPageRule("/admin/products/abc")).toBeNull();
    expect(getAdminPageRule("/admin/jobs/abc")).toBeNull();
    expect(canAccessAdminPage(admin("support"), "/admin/users/export")).toBe(false);
  });

  it("零权限管理员无法进入任何业务页面", () => {
    const noPermissions = admin("unknown-role");
    for (const pathname of [
      "/admin",
      "/admin/users",
      "/admin/admins",
      "/admin/products",
      "/admin/jobs",
      "/admin/messages",
      "/admin/audit-logs",
      "/admin/audit-retention",
      "/admin/sso/audit",
      "/admin/subsites/advisor",
    ]) {
      expect(canAccessAdminPage(noPermissions, pathname), pathname).toBe(false);
    }
  });

  it("anyOf 页面满足任一权限即可", () => {
    expect(canAccessAdminPage(admin("hr"), "/admin/point-gifts")).toBe(false);
    expect(canAccessAdminPage(admin("support"), "/admin/point-gifts")).toBe(true);
    expect(canAccessAdminPage(admin("finance"), "/admin/spent-adjustments")).toBe(true);
    expect(canAccessAdminPage(admin("hr"), "/admin/approvals")).toBe(true);
  });

  it("allOf 页面必须满足全部权限，编辑页还必须能读取待编辑数据", () => {
    const writeOnly = admin("unknown-role", ["products:write"]);
    expect(canAccessAdminPage(writeOnly, "/admin/products/new")).toBe(false);

    const writeAndCategories = admin("unknown-role", ["products:write", "categories:read"]);
    expect(canAccessAdminPage(writeAndCategories, "/admin/products/new")).toBe(true);
    expect(canAccessAdminPage(writeAndCategories, "/admin/products/prod-1/edit")).toBe(false);

    const productEditor = admin("unknown-role", [
      "products:write",
      "products:read",
      "categories:read",
    ]);
    expect(canAccessAdminPage(productEditor, "/admin/products/prod-1/edit")).toBe(true);

    expect(canAccessAdminPage(admin("unknown-role", ["jobs:write"]), "/admin/jobs/new")).toBe(true);
    expect(
      canAccessAdminPage(admin("unknown-role", ["jobs:write"]), "/admin/jobs/job-1/edit")
    ).toBe(false);
    expect(
      canAccessAdminPage(
        admin("unknown-role", ["jobs:write", "jobs:read"]),
        "/admin/jobs/job-1/edit"
      )
    ).toBe(true);
  });

  it("个人撤销覆盖会立即影响页面判定", () => {
    expect(canAccessAdminPage(admin("hr", ["!jobs:read"]), "/admin/jobs")).toBe(false);
    expect(canAccessAdminPage(admin("owner", ["!users:read"]), "/admin/users")).toBe(true);
  });

  it("兼容只传已解析 permissions 的调用方，不会把有效权限误当成追加覆盖", () => {
    const resolved = { role: "finance", permissions: ["users:read"] };
    expect(canAccessAdminPage(resolved, "/admin/users")).toBe(true);
    // finance 模板本身含 audit:read，但已解析列表里没有，必须按列表判断
    expect(canAccessAdminPage(resolved, "/admin/audit-logs")).toBe(false);

    const resolvedWithNullOverrides = {
      role: "finance",
      permissionOverrides: null,
      permissions: ["users:read"],
    };
    expect(canAccessAdminPage(resolvedWithNullOverrides, "/admin/users")).toBe(true);
    expect(canAccessAdminPage(resolvedWithNullOverrides, "/admin/audit-logs")).toBe(false);

    const revoked = { role: "finance", permissionOverrides: ["!audit:read"] };
    expect(canAccessAdminPage(revoked, "/admin/audit-logs")).toBe(false);
  });

  it("导航中的每个入口都有页面权限规则且规则覆盖导航权限", () => {
    for (const item of adminNavItems) {
      const rule = getAdminPageRule(item.href);
      expect(rule, `${item.href} 缺少页面权限规则`).toBeTruthy();
      const rulePermissions = new Set(getAdminPageRulePermissions(rule!));
      const navPermissions = item.permissionsAny ?? (item.permission ? [item.permission] : []);
      expect(navPermissions.length, `${item.href} 未声明权限`).toBeGreaterThan(0);
      for (const permission of navPermissions) {
        expect(rulePermissions.has(permission), `${item.href} 规则未覆盖 ${permission}`).toBe(true);
      }
    }
  });

  it("所有规则均声明了权限或 authenticatedOnly", () => {
    for (const rule of ADMIN_PAGE_RULES) {
      expect(Boolean(rule.authenticatedOnly || rule.allOf?.length || rule.anyOf?.length)).toBe(
        true
      );
    }
  });
});
