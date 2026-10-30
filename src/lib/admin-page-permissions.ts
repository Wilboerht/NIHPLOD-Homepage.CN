/**
 * 管理端页面级权限映射（服务端 / 客户端共用）
 *
 * 服务端 layout 在渲染页面前按 pathname 校验权限，避免只依赖客户端
 * RequirePermission（客户端门禁只能收敛 UI，不能阻止页面组件挂载）。
 *
 * pathname 由 proxy 通过请求头注入。proxy 会覆盖同名请求头，
 * 因此客户端无法通过伪造该头绕过服务端页面权限校验。
 */
import { hasAdminPermission, type AdminPermission } from "./admin-permissions";

export { ADMIN_PAGE_PATH_HEADER } from "./admin-page-path";

export interface AdminPageRule {
  /** 路径匹配（按数组顺序匹配，先匹配先生效） */
  match: (pathname: string) => boolean;
  /** 需要全部满足（AND） */
  allOf?: readonly AdminPermission[];
  /** 任一满足（OR） */
  anyOf?: readonly AdminPermission[];
  /** 登录后即可访问（自服务 / 无业务数据页面） */
  authenticatedOnly?: boolean;
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "") || "/";
  }
  return pathname;
}

function isProductEditPath(pathname: string): boolean {
  return /^\/admin\/products\/[^/]+\/edit\/?$/.test(pathname);
}

function isJobEditPath(pathname: string): boolean {
  return /^\/admin\/jobs\/[^/]+\/edit\/?$/.test(pathname);
}

/**
 * 规则按“具体 → 通用”顺序排列；所有页面都使用精确匹配（尾部斜杠由
 * getAdminPageRule 归一化），未知子路径不会继承父级页面的权限，必须显式注册。
 */
export const ADMIN_PAGE_RULES: readonly AdminPageRule[] = [
  { match: (pathname) => pathname === "/admin", allOf: ["dashboard:read"] },

  // 自服务 / 无业务数据页面：登录即可访问
  { match: (pathname) => pathname === "/admin/settings/totp", authenticatedOnly: true },
  { match: (pathname) => pathname === "/admin/sso/denied", authenticatedOnly: true },
  { match: (pathname) => pathname === "/admin/sso-audit", authenticatedOnly: true },

  // 会员与管理员
  { match: (pathname) => pathname === "/admin/users", allOf: ["users:read"] },
  { match: (pathname) => pathname === "/admin/account-deletions", allOf: ["users:read"] },
  { match: (pathname) => pathname === "/admin/admins", allOf: ["admins:read"] },

  // 商品与分类
  {
    match: isProductEditPath,
    allOf: ["products:write", "products:read", "categories:read"],
  },
  {
    match: (pathname) => pathname === "/admin/products/new",
    allOf: ["products:write", "categories:read"],
  },
  { match: (pathname) => pathname === "/admin/products", allOf: ["products:read"] },
  { match: (pathname) => pathname === "/admin/categories", allOf: ["categories:read"] },

  // 招聘
  {
    match: isJobEditPath,
    allOf: ["jobs:write", "jobs:read"],
  },
  {
    match: (pathname) => pathname === "/admin/jobs/new",
    allOf: ["jobs:write"],
  },
  { match: (pathname) => pathname === "/admin/jobs", allOf: ["jobs:read"] },
  { match: (pathname) => pathname === "/admin/applications", allOf: ["applications:read"] },

  // 会员运营
  { match: (pathname) => pathname === "/admin/messages", allOf: ["messages:read"] },
  {
    match: (pathname) => pathname === "/admin/spent-adjustments",
    anyOf: ["spent:read", "spent:import", "spent:create"],
  },
  {
    match: (pathname) => pathname === "/admin/point-gifts",
    anyOf: ["redemptions:read", "gifts:read"],
  },
  {
    match: (pathname) => pathname === "/admin/approvals",
    anyOf: ["approvals:request", "approvals:review"],
  },

  // 审计
  { match: (pathname) => pathname === "/admin/audit-logs", allOf: ["audit:read"] },
  { match: (pathname) => pathname === "/admin/audit-integrity", allOf: ["audit:read"] },
  {
    match: (pathname) => pathname === "/admin/audit-retention",
    allOf: ["audit:retention:read"],
  },

  // 系统
  { match: (pathname) => pathname === "/admin/cron-tasks", allOf: ["cron:read"] },
  {
    match: (pathname) => pathname === "/admin/webhook-failures",
    allOf: ["webhooks:read"],
  },

  // SSO
  { match: (pathname) => pathname === "/admin/oauth/audit", allOf: ["sso:read"] },
  { match: (pathname) => pathname === "/admin/oauth/consents", allOf: ["sso:read"] },
  { match: (pathname) => pathname === "/admin/oauth/sessions", allOf: ["sso:read"] },
  { match: (pathname) => pathname === "/admin/oauth/stats", allOf: ["sso:read"] },
  {
    match: (pathname) => pathname === "/admin/oauth-clients/wizard",
    allOf: ["sso:clients:write", "sso:clients:read"],
  },
  {
    match: (pathname) => pathname === "/admin/oauth-clients",
    allOf: ["sso:clients:read"],
  },

  // 测肤子站：有概览权限或子站访问权限均可进入（仅有 access 时页面不含概览数据）
  {
    match: (pathname) => pathname === "/admin/subsites/advisor",
    anyOf: ["advisor:stats:read", "advisor:access", "advisor:admin"],
  },
];

export function getAdminPageRule(pathname: string): AdminPageRule | null {
  const normalized = normalizePathname(pathname);
  return ADMIN_PAGE_RULES.find((rule) => rule.match(normalized)) ?? null;
}

export function getAdminPageRulePermissions(rule: AdminPageRule): AdminPermission[] {
  return [...(rule.allOf ?? rule.anyOf ?? [])];
}

/**
 * 服务端页面权限判定。
 * 未知路径默认拒绝（fail-closed），新增页面时必须同步补充映射。
 */
export function canAccessAdminPage(
  admin: { role: string; permissions?: string[] | null; permissionOverrides?: string[] | null },
  pathname: string
): boolean {
  const rule = getAdminPageRule(pathname);
  if (!rule) return false;
  if (rule.authenticatedOnly) return true;

  const can = (permission: AdminPermission): boolean => {
    if (admin.role === "owner") return true;
    // permissionOverrides 是原始覆盖条目（!perm 表示撤销）；permissions 是已解析的
    // 有效权限。两者同时存在时以 overrides 为准，避免把已解析数组当成追加授权。
    if (
      (admin.permissionOverrides === undefined || admin.permissionOverrides === null) &&
      admin.permissions
    ) {
      return admin.permissions.includes(permission);
    }
    return hasAdminPermission(admin, permission);
  };

  if (rule.allOf && !rule.allOf.every((permission) => can(permission))) {
    return false;
  }
  if (rule.anyOf && !rule.anyOf.some((permission) => can(permission))) {
    return false;
  }
  return Boolean(rule.allOf?.length || rule.anyOf?.length);
}
